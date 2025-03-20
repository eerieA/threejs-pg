import * as THREE from 'three';
import * as dat from 'dat.gui';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/Addons.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Get the canvas element
const canvas = document.getElementById('webgl-container');

// Create a Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create a Scene
const scene = new THREE.Scene();

// Create a Camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 2, 2); // Position the camera

// Add a grid helper
const gridHelper = new THREE.GridHelper(2, 20);
scene.add(gridHelper);

// Add an axis helper
const axesHelper = new THREE.AxesHelper(0.1); // 1 is the size of the axes
scene.add(axesHelper);

// Add OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth movement
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 1;
controls.maxDistance = 20;

// Add a Light Source
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(0, 3, 5);
light.color.setRGB(1.0, 1.0, 0.96);
light.intensity = 1.5;
scene.add(light);

const cubeTextureLoader = new THREE.CubeTextureLoader();
const envMap = cubeTextureLoader.load([
  '/cubemap/posx.jpg', '/cubemap/negx.jpg', // +X, -X
  '/cubemap/posy.jpg', '/cubemap/negy.jpg', // +Y, -Y
  '/cubemap/posz.jpg', '/cubemap/negz.jpg'  // +Z, -Z
]);

scene.environment = envMap; // Apply environment map globally
scene.background = envMap;  // Make the cubemap visible by setting it as bg

async function loadShader(url) {
  const response = await fetch(url);
  return await response.text();
}

const guardVs = await loadShader('glsl/guard.vs.glsl');
const guardFs = await loadShader('glsl/guard.fs.glsl');

const guardMaterial = new THREE.ShaderMaterial({
  vertexShader: guardVs,
  fragmentShader: guardFs,
  uniforms: {
      metalness: { value: 0.9 },
      roughness: { value: 0.2 },
      lightPosition: {value: light.position},
      lightColor: {value: light.color},
      lightIntensity: {value: light.intensity},
      envMap: {value: envMap},
      disvProgress: {value: 0.1},
      disvEdgeWidth: {value: 0.05},
      disvEdgeColor: {value: new THREE.Vector3(1.0, 0.0, 0.0)},
  }
});

// ========================================================================== //
// UIs
const gui = new dat.GUI();

// Slider to control dissolve progress for guardMaterial
const params = {
  disvProgress: 0.1,    // Initial value
  disvEdgeWidth: 0.05, // Initial value
  disvEdgeColor: "#ff0000", // Initial value, has to be hex for dat GUI
};
gui.add(params, 'disvProgress', 0.0, 1.0).step(0.01).onChange((value) => {
  guardMaterial.uniforms.disvProgress.value = value;
});
gui.add(params, 'disvEdgeWidth', 0.0, 0.5).step(0.01).onChange((value) => {
  guardMaterial.uniforms.disvEdgeWidth.value = value;
});
gui.addColor(params, 'disvEdgeColor').onChange((value) => {
  // Convert hex string to a THREE.Color, then to a THREE.Vector3
  const color = new THREE.Color(value);
  guardMaterial.uniforms.disvEdgeColor.value.set(color.r, color.g, color.b);
});

// ========================================================================== //
// Particle material
const particleSize = 0.01; // Adjust size as needed
const planeGeometry = new THREE.PlaneGeometry(particleSize, particleSize);

// Vertex shader for instanced particles:
const particleVertexShader = `
  uniform float time;
  uniform float risingSpeed;
  uniform float turbulenceAmplitude;
  uniform float fadeStartHeight; // e.g., 5.0
  uniform float fadeEndHeight;   // e.g., 10.0

  attribute float instanceBirth;
  attribute float instanceLife;
  varying float vAlpha;
  varying vec3 vPosition;  

  void main() {
    // Get the transformed world position from the instance matrix.
    vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
    
    // Compute the age of this particle.
    float age = time - instanceBirth;
    float t = clamp(age / instanceLife, 0.0, 1.0);
    
    // Apply a rising offset.
    worldPosition.y += risingSpeed * age;
    
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
    
    // Compute alpha fade for the ash effect.
    // Compute fade factor based on age.
    float fadeAge = 1.0 - smoothstep(0.8, 1.0, t);
    
    // Compute fade factor based on the world y position.
    float fadeHeight = 1.0 - smoothstep(fadeStartHeight, fadeEndHeight, worldPosition.y);
    
    // Combine the two fade factors.
    vAlpha = fadeAge * fadeHeight;
    vPosition = worldPosition.xyz;
    
    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
  }
`;

// Fragment shader remains similar (using vPosition to compute noise):
const particleFragmentShader = `
  uniform float disvProgress;
  uniform float disvEdgeWidth;
  varying vec3 vPosition;
  varying float vAlpha;

  // Perlin noise helper functions
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
    
    vec2 left_top = cell_pos_in_grid + vec2(0.0, 1.0);
    vec2 right_top = cell_pos_in_grid + vec2(1.0, 1.0);
    vec2 left_bottom = cell_pos_in_grid + vec2(0.0, 0.0);
    vec2 right_bottom = cell_pos_in_grid + vec2(1.0, 0.0);
    
    float left_top_dot = dot(pos_in_grid - left_top, get_gradient(left_top));
    float right_top_dot = dot(pos_in_grid - right_top, get_gradient(right_top));
    float left_bottom_dot = dot(pos_in_grid - left_bottom, get_gradient(left_bottom));
    float right_bottom_dot = dot(pos_in_grid - right_bottom, get_gradient(right_bottom));
    
    float noise_value = mix(
      mix(left_bottom_dot, right_bottom_dot, blend.x), 
      mix(left_top_dot, right_top_dot, blend.x), 
      blend.y);
    return (0.5 + 0.5 * (noise_value / 0.7));
  }

  void main() {
    // Compute noise for dissolve effect:
    float noise = perlin_noise(vPosition.xy, 10.0);
    
    // Define the dissolve band:
    float lower = disvProgress;
    float upper = disvProgress + disvEdgeWidth * 2.0; // Make particle gen a bit wider than the edge 
    if (noise > upper || noise < lower) {
      discard;
    }
    
    // Apply color and the fading alpha
    gl_FragColor = vec4(1.0, 0.5, 0.0, vAlpha);
  }
`;

// Create the ShaderMaterial for the particles
const particleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0.0 },
    disvProgress: { value: params.disvProgress },
    disvEdgeWidth: { value: params.disvEdgeWidth },
    risingSpeed: { value: 0.1 },
    turbulenceAmplitude: { value: 0.02 },
    fadeStartHeight: { value: 1.8 },
    fadeEndHeight: { value: 2.2 }
  },
  vertexShader: particleVertexShader,
  fragmentShader: particleFragmentShader,
  transparent: true
});

const particleLifeBase = 5.0;
const particleLifeRange = 10.0;

// ========================================================================== //
// FBX model setup
const loader = new FBXLoader();
loader.load(
  '/guard.fbx', // Path relative to the public/ folder
  (fbx) => {
    fbx.scale.set(1.0, 1.0, 1.0); // Scale down if too large
    fbx.position.set(0.0, 0.0, 0.0);

    fbx.traverse((child) => {
      if (child.isMesh) {
        child.material = guardMaterial;
        child.material.needsUpdate = true;
      }
    });

    scene.add(fbx);

    // ----- Sample the model's surface to generate particle positions -----
    let meshForSampling = null;
    fbx.traverse((child) => {
      if (child.isMesh && !meshForSampling) {
        meshForSampling = child;
      }
    });

    if (meshForSampling) {
      // Ensure geometry is ready
      meshForSampling.geometry = mergeVertices(meshForSampling.geometry); // Has to do this, or else it will lose smooth shading
      meshForSampling.geometry.computeBoundingBox();
      meshForSampling.geometry.computeVertexNormals();

      const sampler = new MeshSurfaceSampler(meshForSampling).build();
      const particleCount = 60000;
      const instancedMesh = new THREE.InstancedMesh(planeGeometry, particleMaterial, particleCount);
      
      // Create arrays for custom per-instance attributes:
      const instanceBirth = new Float32Array(particleCount);
      const instanceLife = new Float32Array(particleCount);
      
      const dummy = new THREE.Object3D();
      const tempPosition = new THREE.Vector3();
      for (let i = 0; i < particleCount; i++) {
        sampler.sample(tempPosition);
        // Somehow we always have to flip signs of y and z
        tempPosition.y *= -1.0;
        tempPosition.z *= -1.0;
        tempPosition.y += 0.2;  // Adjust for the sampler's inaccuracy
        tempPosition.x += (-1.0 + Math.random() * 2.0) * 0.1; // Add some randomness to the birth x pos
        
        // Set the instance transform
        dummy.position.copy(tempPosition);
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        dummy.scale.setScalar(0.4 + Math.random() * 0.9); // Set starting scale, the largest scale is 1.0
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
        
        // Set a random birth time (delay) and a lifetime for this particle
        instanceBirth[i] = Math.random() * particleLifeRange;           // Particle “appears” sometime in the first <range> seconds
        instanceLife[i] = particleLifeBase + Math.random() * particleLifeRange;      // Lifetime between base and base+range seconds
      }
      
      // Attach these custom attributes to the instanced geometry
      instancedMesh.geometry.setAttribute(
        'instanceBirth',
        new THREE.InstancedBufferAttribute(instanceBirth, 1)
      );
      instancedMesh.geometry.setAttribute(
        'instanceLife',
        new THREE.InstancedBufferAttribute(instanceLife, 1)
      );
      
      scene.add(instancedMesh);
    }
  },
  (xhr) => {
    console.log(`FBX Loading: ${(xhr.loaded / xhr.total) * 100}% loaded`);
  },
  (error) => {
    console.error('Error loading FBX:', error);
  }
);

// Animation Loop
function animate() {
  requestAnimationFrame(animate);

  // Update controls on each frame
  controls.update();

  // Update particles (if available)
  if (particleMaterial) {
    particleMaterial.uniforms.time.value = performance.now() / 1000;
    particleMaterial.uniforms.disvProgress.value = params.disvProgress;
    particleMaterial.uniforms.disvEdgeWidth.value = params.disvEdgeWidth;
  }

  renderer.render(scene, camera);
}

// Handle Window Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start Animation
animate();
