#version 300 es

precision mediump float;

out vec4 diffuseColor;

uniform vec4 viewport;
uniform vec3 cameraPosition;
uniform vec3 cameraDirection;
uniform float cameraFovRadians;
uniform samplerCube cubemapTexture;
uniform float globeRotationRadians;

struct Ray {
	vec3 origin;
	vec3 dir; // assumed to be unit length
};

// float maxPrecisionDebugValue = 0.;
// void precisionDebug(float f) {
// 	float absoluteValue = abs(f);
// 	if (absoluteValue < maxPrecisionDebugValue) {
// 		return;
// 	}
// 	maxPrecisionDebugValue = absoluteValue;
// }
// void precisionDebug(vec2 v) {
// 	precisionDebug(v.x);
// 	precisionDebug(v.y);
// }
// void precisionDebug(vec3 v) {
// 	precisionDebug(v.x);
// 	precisionDebug(v.y);
// 	precisionDebug(v.z);
// }
// void precisionDebug(Ray r) {
// 	precisionDebug(r.origin);
// 	precisionDebug(r.dir);
// }

Ray getFragmentRay(const Ray cameraRay, const float fovRadians) {
	// Returns a ray representing the current pixel (fragment) being rendered by this shader.

	vec3 left = normalize(cross(vec3(0., 1., 0.), cameraRay.dir));
	vec3 up = cross(cameraRay.dir, left);

	float aspectRatio = viewport.z / viewport.w;
	float halfFOV = tan(.5 * fovRadians);

	Ray fragmentRay = cameraRay;

	// In landscape orientation, fovRadians will correspond to the vertical field-of view.
	// In portrait orientation, fovRadians will correspond to the horizontal field-of view.
	float aspectY = viewport.z > viewport.w ? 1. : (1. / aspectRatio);
	float aspectX = viewport.z > viewport.w ? aspectRatio : 1.;

	fragmentRay.dir += up   * (2. * gl_FragCoord.y / viewport.w - 1.) * halfFOV * aspectY;
	fragmentRay.dir -= left * (2. * gl_FragCoord.x / viewport.z - 1.) * halfFOV * aspectX;

	fragmentRay.dir = normalize(fragmentRay.dir);

	return fragmentRay;
}

float raySphereIntersect(const Ray ray, const vec3 spherePosition, const float sphereRadius) {
	// Returns the distance between the ray/sphere intersection point and the ray origin, or -1
	// if there is no intersection.
	// Adapted from https://iquilezles.org/articles/intersectors/
	vec3 oc = ray.origin - spherePosition;
	float dotDirOC = dot(oc, ray.dir);
	float root = dotDirOC * dotDirOC - (dot(oc, oc) - sphereRadius * sphereRadius);
	const float epsilon = .001;
	if(root < epsilon) {
		return -1.;
	}
	float p = -dotDirOC;
	float q = sqrt(root);
	return (p - q) > 0. ? p - q : p + q;
}

vec3 rotateY(const vec3 v, const float angleRadians) {
	// Rotate the given vector around the Y axis
	float angleSin = sin(angleRadians);
	float angleCos = cos(angleRadians);
	return vec3(
		v.x * angleCos - v.z * angleSin,
		v.y,
		v.x * angleSin + v.z * angleCos
	);
}

void main() {
	Ray cameraRay = Ray(cameraPosition, cameraDirection);
	Ray fragmentRay = getFragmentRay(cameraRay, cameraFovRadians);

	const vec3 lightDirection = vec3(.7, .7, -.2);

	vec3 globePosition = vec3(0.);
	float globeRadius = 1.;

	vec3 backgroundColor = vec3(0., 0., 0.);
	vec3 landColorBright = vec3(1.);
	vec3 landColorDark   = vec3(.8);
	vec3 oceanColor      = vec3(38./255., 139./255., 210./255.);

	float globeIntersect = raySphereIntersect(fragmentRay, globePosition, globeRadius);

	// Calculate sphere anti-aliasing from https://bgolus.medium.com/rendering-a-sphere-on-a-quad-13c92025570c#5378
	vec3 closestPointOnRayToGlobeCenter = fragmentRay.origin + (fragmentRay.dir * dot((globePosition - fragmentRay.origin), fragmentRay.dir));
	float distGlobeCenterToRay = distance(closestPointOnRayToGlobeCenter, globePosition);
	float fDist = length(vec2(dFdx(distGlobeCenterToRay), dFdy(distGlobeCenterToRay)));
	float alpha = clamp((1. - distGlobeCenterToRay) / max(fDist, .0001) + 1., 0., 1.);

	vec3 globeSurfacePosition = globeIntersect < 0. ? closestPointOnRayToGlobeCenter : (fragmentRay.origin + (fragmentRay.dir * globeIntersect));

	float landMapDistance = .5 - texture(cubemapTexture, rotateY(globeSurfacePosition, globeRotationRadians)).r;
	float landShading = (dot(normalize(globeSurfacePosition), lightDirection) + 1.) * .5;
	vec3 landColor = mix(landColorDark, landColorBright, landShading);

	vec2 landMapDistPerPixel = vec2(dFdx(landMapDistance), dFdy(landMapDistance));

	vec3 globeColor;
	if (landMapDistance < -0.03) {
		globeColor = landColor;
	} else if (landMapDistance > 0.03) {
		globeColor = oceanColor;
	} else {
		// Calculate anti-aliased edge as per https://drewcassidy.me/2020/06/26/sdf-antialiasing
		float pixelsToLandEdge = landMapDistance / length(landMapDistPerPixel);
		float landPixelCoverage = clamp(.5 - pixelsToLandEdge, 0., 1.);
		globeColor = mix(oceanColor, landColor, landPixelCoverage);
	}

	diffuseColor.a = 1.;
	diffuseColor.rgb = mix(backgroundColor, globeColor, alpha);

// 	if (maxPrecisionDebugValue > 16384.) {
// 		diffuseColor = vec4(1., 0., 0., 1.);
// 	}
}
