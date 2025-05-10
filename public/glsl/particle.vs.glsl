uniform float time;
uniform float risingSpeed;
uniform float turbulenceAmplitude;
uniform float fadeStartHeight; // e.g., 5.0
uniform float fadeEndHeight;   // e.g., 10.0
uniform float loopDuration;

attribute float instanceBirth;
out float vAlpha;
out vec3 vPosition;

void main() {
    // Get the transformed world position from the instance matrix.
    vec4 worldPosition = instanceMatrix * vec4(position, 1.0);

    // Compute the age of this particle.
    float age = time - instanceBirth;
    float loopAge = mod(age, loopDuration); // Looping behavior

    worldPosition.y += risingSpeed * loopAge;

    // Apply turbulence offset
    // Use sine functions to compute an offset vector.
    float frequencyX = 1.0;
    float frequencyY = 1.2;
    float frequencyZ = 1.4;
    vec3 sineOffset = vec3(
        sin(time + worldPosition.x * frequencyX),
        sin(time + worldPosition.y * frequencyY),
        sin(time + worldPosition.z * frequencyZ)
    );
    // Apply the offset scaled by turbulenceAmplitude:
    worldPosition.xyz += sineOffset * turbulenceAmplitude;

    float fadeHeight = 1.0 - smoothstep(fadeStartHeight, fadeEndHeight, worldPosition.y);

    vAlpha = fadeHeight;
    vPosition = worldPosition.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
}