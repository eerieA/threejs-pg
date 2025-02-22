uniform samplerCube envMap;
uniform float metalness;
uniform float roughness;

uniform vec3 lightPosition;  // Light source world position
uniform vec3 lightColor;     // Light color
uniform float lightIntensity; // Light intensity
// uniform vec3 cameraPosition; // Camera position is built-in

varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 lightDir = normalize(lightPosition - vWorldPos);

    // Lambertian Diffuse Lighting
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * lightColor * lightIntensity;

    // Blinn-Phong Specular Highlights
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), mix(10.0, 100.0, 1.0 - roughness));
    vec3 specular = spec * lightColor * lightIntensity;

    // Reflection from Environment Map
    vec3 reflectDir = reflect(-viewDir, normal);
    vec3 envColor = textureCube(envMap, reflectDir).rgb;

    // Mix base color with reflections
    vec3 baseColor = vec3(1.0, 1.0, 1.0);   // The values can be >1.0, the higher, the brighter
    vec3 metalReflect = mix(baseColor, envColor, metalness);

    // Combine lighting effects
    vec3 finalColor = metalReflect * (diffuse + specular);

    gl_FragColor = vec4(finalColor, 1.0);
}
