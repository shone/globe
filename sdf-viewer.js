'use strict';

function setupSdfViewer(canvas, uint8Array, width, height) {
	const gl = canvas.getContext('webgl2');

	{
		const fullscreenTriangleVertexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, fullscreenTriangleVertexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Int8Array([
			-1, -1, // Bottom-left corner
			3, -1, // Bottom-right corner
			-1,  3, // Top-left corner
		]), gl.STATIC_DRAW);
	}

	const shaderProgram = gl.createProgram();

	function loadShader(type, source) {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw 'An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader);
		}
		return shader;
	}

	const vertexShader = loadShader(
		gl.VERTEX_SHADER,
		`#version 300 es
		precision mediump float;
		in vec4 vertexPosition;
		void main() { gl_Position = vertexPosition; }`
		);
	gl.attachShader(shaderProgram, vertexShader);

	const fragmentShader = loadShader(
		gl.FRAGMENT_SHADER,
		`#version 300 es
		precision mediump float;
		out vec4 diffuseColor;
		uniform vec4 viewport;
		uniform sampler2D tex;
		void main() {
			vec2 textureCoord = vec2(gl_FragCoord.x, viewport.w - gl_FragCoord.y) / viewport.zw;
			vec2 viewCenter = vec2(.515, .47);
			vec2 textureCoordTransformed = ((textureCoord - viewCenter) * .03) + viewCenter;
			float value = texture(tex, textureCoordTransformed).a;
			float strata = .05;
			if (value < .5) {
				diffuseColor = vec4(mod(value, strata) / .1, 0., 0., 1.);
			} else {
				diffuseColor = vec4(0., mod(value, strata) / .1, 0., 1.);
			}
			// diffuseColor = vec4(vec3(value <= .5 ? 1. : 0.), 1.);
		}`
	);
	gl.attachShader(shaderProgram, fragmentShader);

	gl.linkProgram(shaderProgram);
	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
	}

	gl.useProgram(shaderProgram);

	{
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
	}

	const viewportUniform = gl.getUniformLocation(shaderProgram, 'viewport');
	gl.uniform4f(viewportUniform, 0, 0, canvas.width, canvas.height);

	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

	gl.texImage2D(
		gl.TEXTURE_2D,
		0, // Level of detail
		gl.ALPHA, // Internal format
		width,
		height,
		0, // Border (must be 0)
		gl.ALPHA, // Format
		gl.UNSIGNED_BYTE, // Type
		uint8Array,
	);

	gl.generateMipmap(gl.TEXTURE_2D);

	function render() {
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);
	}

	render();
}
