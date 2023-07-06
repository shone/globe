#version 300 es

precision mediump float;

out vec4 diffuseColor;

uniform vec4 viewport;
uniform vec3 cameraPosition;
uniform vec3 cameraDirection;
uniform samplerCube cubemapTexture;

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

Ray getFragmentRay(Ray camera, float fov) {
	vec3 left = normalize(cross(vec3(0., 1., 0.), camera.dir));
	vec3 up = cross(camera.dir, left);

	float aspectRatio = viewport.z / viewport.w;
	float halfFOV = tan(.5 * radians(fov));

	Ray ray;
	ray.origin = camera.origin;
	ray.dir = camera.dir;

	ray.dir += up    * (2. * gl_FragCoord.y / viewport.w - 1.) * halfFOV;
	ray.dir -= left * (2. * gl_FragCoord.x / viewport.z - 1.) * halfFOV * aspectRatio;

	ray.dir = normalize(ray.dir);

	return ray;
}

float raySphereIntersect(const Ray ray, const vec3 spherePosition, const float sphereRadius) {
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

void main() {
	Ray cameraRay = Ray(cameraPosition, cameraDirection);
	Ray fragmentRay = getFragmentRay(cameraRay, 45.);

	const vec3 lightDirection = vec3(.7, .7, -.2);

	vec3 globePosition = vec3(0.);
	float globeRadius = 1.;

	vec4 backgroundColor = vec4(0., 0., 0., 1.);
	vec3 landColorBright = vec3(1.);
	vec3 landColorDark   = vec3(.8);
	vec3 oceanColor      = vec3(0., 0., .4);

	diffuseColor = backgroundColor;

	float globeIntersect = raySphereIntersect(fragmentRay, globePosition, globeRadius);

	// TODO: Implement sphere edge anti-aliasing from https://www.shadertoy.com/view/MsSSWV
	
	if (globeIntersect >= 0.) {
		vec3 globeSurfacePosition = fragmentRay.origin + (fragmentRay.dir * globeIntersect);
		float landMapDistance = .5 - texture(cubemapTexture, globeSurfacePosition).r;
		float landShading = (dot(normalize(globeSurfacePosition), lightDirection) + 1.) * .5;
		vec3 landColor = mix(landColorDark, landColorBright, landShading);

		vec2 landMapDistPerPixel = vec2(dFdx(landMapDistance), dFdy(landMapDistance));

		if (landMapDistance < -0.03) {
			diffuseColor.rgb = landColor;
		} else if (landMapDistance > 0.03) {
			diffuseColor.rgb = oceanColor;
		} else {
			// Calculate anti-aliased edge as per https://drewcassidy.me/2020/06/26/sdf-antialiasing
			float pixelsToLandEdge = landMapDistance / length(landMapDistPerPixel);
			float landPixelCoverage = clamp(.5 - pixelsToLandEdge, 0., 1.);
			diffuseColor.rgb = mix(oceanColor, landColor, landPixelCoverage);
		}
	}

// 	if (maxPrecisionDebugValue > 16384.) {
// 		diffuseColor = vec4(1., 0., 0., 1.);
// 	}
}
