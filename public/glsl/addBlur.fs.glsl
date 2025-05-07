uniform sampler2D tBase;
uniform sampler2D tGlow;
varying vec2 vUv;

void main() {
    vec4 base = texture2D(tBase, vUv);
    vec4 glow = texture2D(tGlow, vUv);

    // Additive blending in linear space (preserves PBR lighting)
    vec3 result = base.rgb + glow.rgb;

    // Apply tone mapping before gamma correction
    // ACES approximation (matches Three.js' default)
    vec3 tonemapped = result * 0.6; // exposure adjustment
    tonemapped = (tonemapped * (2.51 * tonemapped + 0.03)) /
        (tonemapped * (2.43 * tonemapped + 0.59) + 0.14);

    // Gamma correction
    tonemapped = pow(tonemapped, vec3(1.0 / 1.8));

    gl_FragColor = vec4(tonemapped, base.a);
}