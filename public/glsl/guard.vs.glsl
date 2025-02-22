varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz; // Convert to world space

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
