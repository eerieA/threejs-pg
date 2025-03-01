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

// Classic Perlin noise function (2D)
vec2 n22 (vec2 p)
{
    vec3 a = fract(p.xyx * vec3(123.34, 234.34, 345.65));
    a += dot(a, a + 34.45);
    return fract(vec2(a.x * a.y, a.y * a.z));
}
vec2 get_gradient(vec2 pos)
{
    float twoPi = 6.283185;
    float angle = n22(pos).x * twoPi;
    return vec2(cos(angle), sin(angle));
}
float perlin_noise(vec2 uv, float cells_count)
{
    vec2 pos_in_grid = uv * cells_count;
    vec2 cell_pos_in_grid =  floor(pos_in_grid);
    vec2 local_pos_in_cell = (pos_in_grid - cell_pos_in_grid);
    vec2 blend = local_pos_in_cell * local_pos_in_cell * (3.0f - 2.0f * local_pos_in_cell);
    
    vec2 left_top = cell_pos_in_grid + vec2(0, 1);
    vec2 right_top = cell_pos_in_grid + vec2(1, 1);
    vec2 left_bottom = cell_pos_in_grid + vec2(0, 0);
    vec2 right_bottom = cell_pos_in_grid + vec2(1, 0);
    
    float left_top_dot = dot(pos_in_grid - left_top, get_gradient(left_top));
    float right_top_dot = dot(pos_in_grid - right_top,  get_gradient(right_top));
    float left_bottom_dot = dot(pos_in_grid - left_bottom, get_gradient(left_bottom));
    float right_bottom_dot = dot(pos_in_grid - right_bottom, get_gradient(right_bottom));
    
    float noise_value = mix(
                            mix(left_bottom_dot, right_bottom_dot, blend.x), 
                            mix(left_top_dot, right_top_dot, blend.x), 
                            blend.y);   
    
    // Returns float in [0.0, 1.0]
    return (0.5 + 0.5 * (noise_value / 0.7));
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 lightDir = normalize(lightPosition - vWorldPos);

    // Dissolution related
    vec2 uv = vWorldPos.xy * 1.0; // Scale of noise pattern, adjust as needed
    float noise = perlin_noise(uv, 10.0);
    if (noise < disvProgress) {
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
