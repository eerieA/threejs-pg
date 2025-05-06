uniform samplerCube envMap;
uniform float metalness;
uniform float roughness;

uniform vec3 lightPosition;  // Light source world position
uniform vec3 lightColor;     // Light color
uniform float lightIntensity; // Light intensity
// uniform vec3 cameraPosition; // Camera position is built-in

uniform float disvProgress;
uniform float disvEdgeWidth;
uniform vec3 disvEdgeColor;

varying vec3 vNormal;
varying vec3 vWorldPos;

// Classic 2D Perlin noise functions
vec2 n22(vec2 p) {
    vec3 a = fract(p.xyx * vec3(123.34, 234.34, 345.65));
    a += dot(a, a + 34.45);
    return fract(vec2(a.x * a.y, a.y * a.z));
}
vec2 get_gradient(vec2 pos) {
    float twoPi = 6.283185;
    float angle = n22(pos).x * twoPi;
    return vec2(cos(angle), sin(angle));
}
float perlin_noise(vec2 uv, float cells_count) {
    vec2 pos_in_grid = uv * cells_count;
    vec2 cell_pos_in_grid = floor(pos_in_grid);
    vec2 local_pos_in_cell = (pos_in_grid - cell_pos_in_grid);
    vec2 blend = local_pos_in_cell * local_pos_in_cell * (3.0 - 2.0 * local_pos_in_cell);

    vec2 left_top = cell_pos_in_grid + vec2(0, 1);
    vec2 right_top = cell_pos_in_grid + vec2(1, 1);
    vec2 left_bottom = cell_pos_in_grid + vec2(0, 0);
    vec2 right_bottom = cell_pos_in_grid + vec2(1, 0);

    float left_top_dot = dot(pos_in_grid - left_top, get_gradient(left_top));
    float right_top_dot = dot(pos_in_grid - right_top, get_gradient(right_top));
    float left_bottom_dot = dot(pos_in_grid - left_bottom, get_gradient(left_bottom));
    float right_bottom_dot = dot(pos_in_grid - right_bottom, get_gradient(right_bottom));

    float noise_value = mix(mix(left_bottom_dot, right_bottom_dot, blend.x), mix(left_top_dot, right_top_dot, blend.x), blend.y);   

    // Returns float in [0.0, 1.0]
    return (0.5 + 0.5 * (noise_value / 0.7));
}

// Classic 3D perlin noise
vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec4 permute(vec4 x) {
    return mod289(((x * 34.0) + 1.0) * x);
}
vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}
float perlin_noise_3d(vec3 P) {
    vec3 i0 = floor(P);
    vec3 f0 = fract(P);
    vec3 f1 = f0 * f0 * (3.0 - 2.0 * f0);

    vec4 ix = vec4(i0.x, i0.x + 1.0, i0.x, i0.x + 1.0);
    vec4 iy = vec4(i0.y, i0.y, i0.y + 1.0, i0.y + 1.0);
    vec4 iz0 = vec4(i0.z);
    vec4 iz1 = vec4(i0.z + 1.0);

    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);

    vec4 gx0 = ixy0 * (1.0 / 7.0);
    vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);

    vec4 gx1 = ixy1 * (1.0 / 7.0);
    vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);

    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
    vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
    vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
    vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
    vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;

    float n000 = dot(g000, f0);
    float n100 = dot(g100, f0 - vec3(1.0, 0.0, 0.0));
    float n010 = dot(g010, f0 - vec3(0.0, 1.0, 0.0));
    float n110 = dot(g110, f0 - vec3(1.0, 1.0, 0.0));
    float n001 = dot(g001, f0 - vec3(0.0, 0.0, 1.0));
    float n101 = dot(g101, f0 - vec3(1.0, 0.0, 1.0));
    float n011 = dot(g011, f0 - vec3(0.0, 1.0, 1.0));
    float n111 = dot(g111, f0 - vec3(1.0, 1.0, 1.0));

    vec3 fade_xyz = f1;
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 0.5 + 0.5 * n_xyz;
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 lightDir = normalize(lightPosition - vWorldPos);

    // Dissolution related
    vec2 uv = vWorldPos.xy * 1.0; // Scale of noise pattern, adjust as needed
    // float noise = perlin_noise(uv, 10.0); // Using 2D perlin noise on uv
    float noise = perlin_noise_3d(vWorldPos * 10.0); // Using 3D perlin noise on world pos
    if(noise < disvProgress) {
        discard; // Make some fragments disappear
    }

    // Define the full edge width range
    float edgeWidth = disvEdgeWidth; // or tweak as needed
    // Compute a smooth interpolation factor for the edge region:
    float t = clamp((noise - disvProgress) / edgeWidth, 0.0, 1.0);
    t = pow(t, 7.0); // Increase exponent for a sharper transition

    // Unaffected material
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
    vec3 unaffectedColor = metalReflect * (diffuse + specular);

    // Blend between edge color and unaffected material using factor t
    vec3 finalBlendedColor = mix(disvEdgeColor, unaffectedColor, t);

    // TODO: this is not working well
    float edgeFactor = pow(1.0 - smoothstep(disvProgress - disvEdgeWidth * 0.2, disvProgress + disvEdgeWidth * 0.8, noise), 3.0);

    gl_FragColor = vec4(finalBlendedColor, 1.0 - edgeFactor);
}
