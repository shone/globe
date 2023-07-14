'use strict';

// Adapted from https://github.com/jaxry/panorama-to-cubemap

onmessage = event => {
	const {readData, cubeFaceName} = event.data;

	const faceWidth = readData.width / 4;
	const faceHeight = faceWidth;

	const transformPointFaceToCube = {
		pos_z: (x, y) => ({x: -1, y: -x, z: -y}),
		neg_z: (x, y) => ({x:  1, y:  x, z: -y}),
		pos_x: (x, y) => ({x:  x, y: -1, z: -y}),
		neg_x: (x, y) => ({x: -x, y:  1, z: -y}),
		pos_y: (x, y) => ({x: -y, y: -x, z:  1}),
		neg_y: (x, y) => ({x:  y, y: -x, z: -1}),
	}[cubeFaceName];

	const writeData = new Uint8ClampedArray(faceWidth * faceHeight * 4);

	const copyPixel = copyPixelNearest(readData, writeData);
	// const copyPixel = copyPixelLanczos(readData, writeData);

	for (let x = 0; x < faceWidth; x++) {
		for (let y = 0; y < faceHeight; y++) {
			const to = 4 * (y * faceWidth + x);

			// fill alpha channel
			writeData[to + 3] = 255;

			const positionOnCube = transformPointFaceToCube(
				(2 * (x + .5) / faceWidth  - 1),
				(2 * (y + .5) / faceHeight - 1)
			);

			const distanceFromCenter = Math.sqrt(
				positionOnCube.x*positionOnCube.x +
				positionOnCube.y*positionOnCube.y +
				positionOnCube.z*positionOnCube.z
			);
			const longitudeRadians = euclideanModulo(Math.atan2(positionOnCube.y, positionOnCube.x), 2 * Math.PI);
			const latitudeRadians = Math.acos(positionOnCube.z / distanceFromCenter);

			copyPixel(
				readData.width  * longitudeRadians / Math.PI / 2 - .5,
				readData.height * latitudeRadians  / Math.PI - .5,
				to
			);
		}
	}

	postMessage({writeData, faceWidth, faceHeight}, [writeData.buffer]);
}

function copyPixelNearest(read, write) {
	const {width, height, data} = read;
	const readIndex = (x, y) => 4 * (y * width + x);

	return (xFrom, yFrom, to) => {

		const nearest = readIndex(
			clamp(Math.round(xFrom), 0, width  - 1),
			clamp(Math.round(yFrom), 0, height - 1)
		);

		for (let channel = 0; channel < 3; channel++) {
			write[to + channel] = data[nearest + channel];// < 128 ? 0 : 255;
		}
	};
}

function copyPixelLanczos(read, write) {
  const filterSize = 5;
  const kernel = x => {
    if (x === 0) {
      return 1;
    }
    else {
      const xp = Math.PI * x;
      return filterSize * Math.sin(xp) * Math.sin(xp / filterSize) / (xp * xp);
    }
  };

  return kernelResample(read, write, filterSize, kernel);
}

function kernelResample(read, write, filterSize, kernel) {
  const {width, height, data} = read;
  const readIndex = (x, y) => 4 * (y * width + x);

  const twoFilterSize = 2*filterSize;
  const xMax = width - 1;
  const yMax = height - 1;
  const xKernel = new Array(4);
  const yKernel = new Array(4);

  return (xFrom, yFrom, to) => {
    const xl = Math.floor(xFrom);
    const yl = Math.floor(yFrom);
    const xStart = xl - filterSize + 1;
    const yStart = yl - filterSize + 1;

    for (let i = 0; i < twoFilterSize; i++) {
      xKernel[i] = kernel(xFrom - (xStart + i));
      yKernel[i] = kernel(yFrom - (yStart + i));
    }

    for (let channel = 0; channel < 3; channel++) {
      let q = 0;

      for (let i = 0; i < twoFilterSize; i++) {
        const y = yStart + i;
        const yClamped = clamp(y, 0, yMax);
        let p = 0;
        for (let j = 0; j < twoFilterSize; j++) {
          const x = xStart + j;
          const index = readIndex(clamp(x, 0, xMax), yClamped);
          p += data[index + channel] * xKernel[j];

        }
        q += p * yKernel[i];
      }

      write[to + channel] = Math.round(q);
    }
  };
}

function clamp(f, min, max) {
	f = Math.min(f, max);
	f = Math.max(f, min);
	return f;
}

function euclideanModulo(x, n) {
	return ((x % n) + n) % n;
}
