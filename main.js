'use strict';

const canvas = document.getElementById('globe-canvas');
const gl = canvas.getContext('webgl2');

const h1 = document.querySelector('h1');
h1.onpointerup = event => {
	event.preventDefault();
	h1.scrollIntoView({
		block: 'start',
		behavior: 'smooth',
	});
}

const inputMask = document.getElementById('input-mask');
inputMask.onload = async () => {
	const inputMaskCanvas = document.createElement('canvas');
	inputMaskCanvas.width = 2048;
	inputMaskCanvas.height = 1024;
	let inputMaskRgbaData = null;
	{
		const context = inputMaskCanvas.getContext('2d');
		context.drawImage(inputMask, 0, 0, inputMaskCanvas.width, inputMaskCanvas.height);
		inputMaskRgbaData = context.getImageData(0, 0, inputMaskCanvas.width, inputMaskCanvas.height).data;
	}

	const sampleViewboxLeft = inputMaskCanvas.width * .46;
	const sampleViewboxTop = inputMaskCanvas.height * .18;
	const sampleViewboxSize = inputMaskCanvas.width * .04;

	{
		const inputMaskViewboxCanvas = document.getElementById('input-mask-viewbox');
		const context = inputMaskViewboxCanvas.getContext('2d');
		context.drawImage(
			inputMaskCanvas,
			sampleViewboxLeft, sampleViewboxTop, // Source position
			sampleViewboxSize, sampleViewboxSize, // Source dimensions
			0, 0, // Destination position
			inputMaskViewboxCanvas.width, inputMaskViewboxCanvas.height, // Destination dimensions
		);
	}

	const singleChannelData = new Uint8ClampedArray(inputMaskCanvas.width*inputMaskCanvas.height);
	for (var i = 0; i < singleChannelData.length; i++) {
		singleChannelData[i] = inputMaskRgbaData[i*4];
	}

	const signedDistanceFieldWorker = new Worker('signed-distance-field.js');
	signedDistanceFieldWorker.postMessage({data: singleChannelData, width: inputMaskCanvas.width, height: inputMaskCanvas.height});
	const signedDistanceFieldResponse = await new Promise(resolve => signedDistanceFieldWorker.onmessage = event => resolve(event.data));
	const imgArr = new Uint8ClampedArray(inputMaskCanvas.width*inputMaskCanvas.height*4)
	for (let x = 0; x < inputMaskCanvas.width; x++) {
		for (let y = 0; y < inputMaskCanvas.height; y++) {
			const value = signedDistanceFieldResponse[y*inputMaskCanvas.width+x];
			imgArr[y*inputMaskCanvas.width*4 + x*4 + 0] = value;
			imgArr[y*inputMaskCanvas.width*4 + x*4 + 1] = value;
			imgArr[y*inputMaskCanvas.width*4 + x*4 + 2] = value;
			imgArr[y*inputMaskCanvas.width*4 + x*4 + 3] = 255;
		}
	}
	const sdfImageData = new ImageData(imgArr, inputMaskCanvas.width, inputMaskCanvas.height);

	{
		const sdfFullsizeCanvas = document.createElement('canvas');
		sdfFullsizeCanvas.width = inputMaskCanvas.width;
		sdfFullsizeCanvas.height = inputMaskCanvas.height;
		const sdfFullsizeCanvasContext = sdfFullsizeCanvas.getContext('2d');
		sdfFullsizeCanvasContext.putImageData(sdfImageData, 0, 0);

		const sdfViewboxCanvas = document.getElementById('sdf-viewbox');
		const sdfViewboxCanvasContext = sdfViewboxCanvas.getContext('2d');
		sdfViewboxCanvasContext.drawImage(
			sdfFullsizeCanvas,
			sampleViewboxLeft, sampleViewboxTop, // Source position
			sampleViewboxSize, sampleViewboxSize, // Source dimensions
			0, 0, // Destination position
			sdfViewboxCanvas.width, sdfViewboxCanvas.height, // Destination dimensions
		);

		const sdfViewer = document.getElementById('sdf-viewer');
		setupSdfViewer(sdfViewer, signedDistanceFieldResponse, inputMaskCanvas.width, inputMaskCanvas.height);
	}

	const faces = await Promise.all([
		loadCubeFace('neg_x'),
		loadCubeFace('neg_y'),
		loadCubeFace('neg_z'),
		loadCubeFace('pos_x'),
		loadCubeFace('pos_y'),
		loadCubeFace('pos_z'),
	]);

	async function loadCubeFace(cubeFaceName) {
		const cubeProjectionWorker = new Worker('cube-projection.js');
		cubeProjectionWorker.postMessage({readData: sdfImageData, cubeFaceName});
		const cubeProjectionResponse = await new Promise(resolve => cubeProjectionWorker.onmessage = event => resolve(event.data));
		const faceData = new ImageData(cubeProjectionResponse.writeData, cubeProjectionResponse.faceWidth, cubeProjectionResponse.faceHeight);

		const cubeFaceCanvas = document.querySelector(`#cube-faces .${cubeFaceName}`);
		cubeFaceCanvas.width = cubeProjectionResponse.faceWidth;
		cubeFaceCanvas.height = cubeProjectionResponse.faceHeight;
		const cubeFaceCanvasContext = cubeFaceCanvas.getContext('2d');
		cubeFaceCanvasContext.putImageData(faceData, 0, 0);

		return {cubeFaceName, faceData};
	}

	const faceGlTargetMap = {
		neg_x: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
		neg_y: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
		neg_z: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
		pos_x: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
		pos_y: gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
		pos_z: gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
	}

	for (const face of faces) {
		gl.texImage2D(
			faceGlTargetMap[face.cubeFaceName],
			0, // Level of detail
			gl.RGBA, // Internal format
			face.faceData.width,
			face.faceData.height,
			0, // Border (must be 0)
			gl.RGBA, // Format
			gl.UNSIGNED_BYTE, // Type
			face.faceData,
		);
	}

	gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
}

// alert(`
// 	${printShaderPrecisionFormat(gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.LOW_FLOAT))}
// 	${printShaderPrecisionFormat(gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT))}
// 	${printShaderPrecisionFormat(gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT))}
// `);
//
// function printShaderPrecisionFormat(fmt) {
// 	return `min: ${fmt.rangeMin}, max: ${fmt.rangeMax}, precision: ${fmt.precision}`;
// }

const fullscreenTriangleVertexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, fullscreenTriangleVertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Int8Array([
	-1, -1, // Bottom-left corner
	 3, -1, // Bottom-right corner
	-1,  3, // Top-left corner
]), gl.STATIC_DRAW);

Promise.all([
	fetch('vertex-shader.glsl').then(response => response.text()),
	fetch('fragment-shader.glsl').then(response => response.text()),
]).then(([vertexShaderSource, fragmentShaderSource]) => {
	const shaderProgram = gl.createProgram();

	const vertexShader = loadShader(gl.VERTEX_SHADER, vertexShaderSource);
	gl.attachShader(shaderProgram, vertexShader);

	const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
	gl.attachShader(shaderProgram, fragmentShader);

	gl.linkProgram(shaderProgram);
	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
	}

	gl.useProgram(shaderProgram);

	const fullscreenTriangleVertexPositionAttributeLocation = gl.getAttribLocation(shaderProgram, 'vertexPosition');
	gl.enableVertexAttribArray(fullscreenTriangleVertexPositionAttributeLocation);
	gl.vertexAttribPointer(
		fullscreenTriangleVertexPositionAttributeLocation,
		2, // Number of components
		gl.BYTE,
		false, // Normalize
		0, // Stride
		0, // Offset
	);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

	const uniforms = {
		viewport:             gl.getUniformLocation(shaderProgram, 'viewport'),
		cameraPosition:       gl.getUniformLocation(shaderProgram, 'cameraPosition'),
		cameraDirection:      gl.getUniformLocation(shaderProgram, 'cameraDirection'),
		cameraFovRadians:     gl.getUniformLocation(shaderProgram, 'cameraFovRadians'),
		globeRotationRadians: gl.getUniformLocation(shaderProgram, 'globeRotationRadians'),
	}

	let cameraPosition  = {x: 0, y: 0, z: 2.7};
	let cameraDirection = {x: 0, y: 0, z: -1};

	gl.uniform3f(uniforms.cameraPosition, cameraPosition.x, cameraPosition.y, cameraPosition.z);
	gl.uniform3f(uniforms.cameraDirection, cameraDirection.x, cameraDirection.y, cameraDirection.z);
	gl.uniform1f(uniforms.cameraFovRadians, Math.PI*2 * (45/360));

	function handleWindowResize() {
		canvas.width  = Math.floor(canvas.offsetWidth * window.devicePixelRatio);
		canvas.height = Math.floor(canvas.offsetHeight * window.devicePixelRatio);
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.uniform4f(uniforms.viewport, 0, 0, canvas.width, canvas.height);
	}
	handleWindowResize();
	window.onresize = handleWindowResize;

	const keysDown = new Set();

	let prevFrameTimestamp = performance.now();

	requestAnimationFrame(function callback(timestamp) {
		const deltaMs = timestamp - prevFrameTimestamp;
		prevFrameTimestamp = timestamp;

		// Rotate the globe counter-clockwise (as when viewed from the north pole), matching the earth's rotation direction.
		gl.uniform1f(uniforms.globeRotationRadians, timestamp * Math.PI*2 * .00001);

		const flyDistance = deltaMs * .001;
		const leftVector = vec.normalized(vec.cross({x: 0, y: 1, z: 0}, cameraDirection));
		const upVector = vec.cross(cameraDirection, leftVector);
		for (const key of keysDown) {
			switch (key) {
			case 'w': cameraPosition = vec.add(cameraPosition, vec.mulScalar(cameraDirection, flyDistance)); break;
			case 'a': cameraPosition = vec.add(cameraPosition, vec.mulScalar(leftVector, flyDistance));      break;
			case 's': cameraPosition = vec.sub(cameraPosition, vec.mulScalar(cameraDirection, flyDistance)); break;
			case 'd': cameraPosition = vec.sub(cameraPosition, vec.mulScalar(leftVector, flyDistance));      break;
			case 'q': cameraPosition = vec.add(cameraPosition, vec.mulScalar(upVector, flyDistance));        break;
			case 'e': cameraPosition = vec.sub(cameraPosition, vec.mulScalar(upVector, flyDistance));        break;
			}
		}
		gl.uniform3f(uniforms.cameraPosition, cameraPosition.x, cameraPosition.y, cameraPosition.z);
		gl.uniform3f(uniforms.cameraDirection, cameraDirection.x, cameraDirection.y, cameraDirection.z);

		render();
		requestAnimationFrame(callback);
	});

	window.onkeydown = event => {
		if (!'wasdqe'.includes(event.key)) {
			return;
		}
		event.preventDefault();
		keysDown.add(event.key);
		render();
	}
	window.onkeyup = event => {
		keysDown.delete(event.key);
	}

	canvas.onpointerdown = downEvent => {
		downEvent.preventDefault();
		if (downEvent.button !== 0) {
			return;
		}
		canvas.setPointerCapture(downEvent.pointerId);
		canvas.onpointermove = moveEvent => {
			if (moveEvent.pointerId !== downEvent.pointerId) {
				return;
			}
			const rightVector = vec.normalized(vec.cross({x: 0, y: 1, z: 0}, cameraDirection));
			const angleXRadians = moveEvent.movementX * Math.PI * -.001;
			const angleYRadians = moveEvent.movementY * Math.PI * .001;
			cameraDirection = vec.applyAxisAngle(cameraDirection, rightVector, angleYRadians);
			cameraDirection = vec.applyAxisAngle(cameraDirection, {x: 0, y: 1, z: 0}, angleXRadians);
			gl.uniform3f(uniforms.cameraDirection, cameraDirection.x, cameraDirection.y, cameraDirection.z);
			render();
		}
		canvas.onpointerup = canvas.onpointercancel = upEvent => {
			if (upEvent.pointerId !== downEvent.pointerId) {
				return;
			}
			canvas.onpointermove = null;
			canvas.onpointerup = null;
			canvas.onpointercancel = null;
		}
	}
});

const cubemapTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapTexture);
gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

async function loadImage(src, target) {
	const image = new Image();
	image.src = src;
	await new Promise(resolve => image.onload = resolve);
	gl.texImage2D(
		target,
		0, // Level of detail
		gl.RGBA, // Internal format
		image.width,
		image.height,
		0, // Border (must be 0)
		gl.RGBA, // Format
		gl.UNSIGNED_BYTE, // Type
		image,
	);
}

Promise.all([
	loadImage('pos_x.png', gl.TEXTURE_CUBE_MAP_POSITIVE_X),
	loadImage('pos_y.png', gl.TEXTURE_CUBE_MAP_POSITIVE_Y),
	loadImage('pos_z.png', gl.TEXTURE_CUBE_MAP_POSITIVE_Z),
	loadImage('neg_x.png', gl.TEXTURE_CUBE_MAP_NEGATIVE_X),
	loadImage('neg_y.png', gl.TEXTURE_CUBE_MAP_NEGATIVE_Y),
	loadImage('neg_z.png', gl.TEXTURE_CUBE_MAP_NEGATIVE_Z),
]).then(() => {
	gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
});

function render() {
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);
}

function loadShader(type, source) {
	const shader = gl.createShader(type);

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}

	return shader;
}

const vec = {
	add(a, b) {
		return {
			x: a.x + b.x,
			y: a.y + b.y,
			z: a.z + b.z,
		}
	},
	sub(a, b) {
		return {
			x: a.x - b.x,
			y: a.y - b.y,
			z: a.z - b.z,
		}
	},
	mulScalar(v, s) {
		return {
			x: v.x * s,
			y: v.y * s,
			z: v.z * s,
		}
	},
	cross(a, b) {
		return {
			x: a.y * b.z - a.z * b.y,
			y: a.z * b.x - a.x * b.z,
			z: a.x * b.y - a.y * b.x,
		}
	},
	normalized(v) {
		const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
		return {
			x: v.x / length,
			y: v.y / length,
			z: v.z / length,
		}
	},
	negate(v) {
		return {
			x: -x,
			y: -y,
			z: -z,
		}
	},
	applyAxisAngle(v, axis, angle) {
		// Adapted from Three.js Quaternion.setFromAxisAngle and Vector3.applyQuaternion
		// See also http://www.euclideanspace.com/maths/geometry/rotations/conversions/angleToQuaternion/index.htm

		const halfAngle = angle / 2, s = Math.sin(halfAngle);

		const qx = axis.x * s;
		const qy = axis.y * s;
		const qz = axis.z * s;
		const qw = Math.cos(halfAngle);

		const ix = qw * v.x + qy * v.z - qz * v.y;
		const iy = qw * v.y + qz * v.x - qx * v.z;
		const iz = qw * v.z + qx * v.y - qy * v.x;
		const iw = - qx * v.x - qy * v.y - qz * v.z;

		// calculate result * inverse quat
		return {
			x: ix * qw + iw * - qx + iy * - qz - iz * - qy,
			y: iy * qw + iw * - qy + iz * - qx - ix * - qz,
			z: iz * qw + iw * - qz + ix * - qy - iy * - qx,
		}
	}
}
