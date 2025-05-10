uniform sampler2D tDiffuse;
uniform vec2 uDirection;
uniform float uBlurAmount;
uniform vec2 uResolution;
varying vec2 vUv;

void main() {
    vec4 color = vec4(0.0);
    float total = 0.0;

    // Calculate pixel size for proper sampling
    vec2 pixelSize = vec2(1.0) / uResolution;

    // Increased sample count and optimized weights
    const int samples = 32;
    float sigma = uBlurAmount * 0.5;

    for(int i = -samples / 2; i <= samples / 2; i++) {
        // Gaussian weight calculation
        float weight = exp(-float(i * i) / (2.0 * sigma * sigma));

        // Properly scaled offset
        vec2 offset = uDirection * float(i) * pixelSize * uBlurAmount;

        color += texture2D(tDiffuse, vUv + offset) * weight;
        total += weight;
    }

    gl_FragColor = color / total;
}