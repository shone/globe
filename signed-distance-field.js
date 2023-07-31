'use strict';

// Based on https://github.com/dy/bitmap-sdf
// An alternative approach may be https://github.com/mapbox/fontnik

const INF = 1e20;

onmessage = event => {
	const {data, width, height} = event.data;

	const cutoff = .5;
	const radius = 20;
	const area = width * height;
	const size = Math.max(width, height);

	// temporary arrays for the distance transform
	const gridOuter = new Float32Array(area);
	const gridInner = new Float32Array(area);
	const f = new Float32Array(size);
	const d = new Float32Array(size);
	const z = new Float32Array(size + 1);
	const v = new Float32Array(size);

	for (let i = 0; i < area; i++) {
		const a = data[i] / 255;
		gridOuter[i] = a === 1 ? 0   : a === 0 ? INF : Math.pow(Math.max(0, .5 - a), 2);
		gridInner[i] = a === 1 ? INF : a === 0 ? 0   : Math.pow(Math.max(0, a - .5), 2);
	}

	edt(gridOuter, width, height, f, d, v, z);
	edt(gridInner, width, height, f, d, v, z);

	const dist = new Uint8ClampedArray(area);

	for (let i = 0; i < area; i++) {
		const distance = 1 - ((gridOuter[i] - gridInner[i]) / radius + cutoff);
		dist[i] = distance * 255;
	}

	postMessage(dist, [dist.buffer]);
}

// 2D Euclidean distance transform by Felzenszwalb & Huttenlocher https://cs.brown.edu/~pff/dt/
function edt(data, width, height, f, d, v, z) {
	for (var x = 0; x < width; x++) {
		for (var y = 0; y < height; y++) {
			f[y] = data[y * width + x];
		}
		edt1d(f, d, v, z, height);
		for (y = 0; y < height; y++) {
			data[y * width + x] = d[y];
		}
	}
	for (y = 0; y < height; y++) {
		for (x = 0; x < width; x++) {
			f[x] = data[y * width + x];
		}
		edt1d(f, d, v, z, width);
		for (x = 0; x < width; x++) {
			data[y * width + x] = Math.sqrt(d[x]);
		}
	}
}

// 1D squared distance transform
function edt1d(f, d, v, z, n) {
	v[0] = 0;
	z[0] = -INF;
	z[1] = +INF;

	for (var q = 1, k = 0; q < n; q++) {
		var s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
		while (s <= z[k]) {
			k--;
			s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
		}
		k++;
		v[k] = q;
		z[k] = s;
		z[k + 1] = +INF;
	}

	for (q = 0, k = 0; q < n; q++) {
		while (z[k + 1] < q) k++;
		d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
	}
}
