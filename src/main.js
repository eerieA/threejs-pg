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

const params = {
  disvProgress: 0.1,    // Initial value
  disvEdgeWidth: 0.02, // Initial value
  disvEdgeColor: "#ff0000", // Initial value, has to be hex for dat GUI
  particleColor: "#00ff00", // Initial value, has to be hex for dat GUI
};
const disvEdgeColorVec3 = new THREE.Color(params.disvEdgeColor);  // Convert from hex to Vec3
const particleColorVec3 = new THREE.Color(params.particleColor);  // Convert from hex to Vec3

const guardVs = await loadShader('glsl/guard.vs.glsl');
const guardFs = await loadShader('glsl/guard.fs.glsl');

const guardMaterial = new THREE.ShaderMaterial({
  vertexShader: guardVs,
  fragmentShader: guardFs,
  uniforms: {
    metalness: { value: 0.9 },
    roughness: { value: 0.2 },
    lightPosition: { value: light.position },
    lightColor: { value: light.color },
    lightIntensity: { value: light.intensity },
    envMap: { value: envMap },
    disvProgress: { value: params.disvProgress },
    disvEdgeWidth: { value: params.disvEdgeWidth },
    disvEdgeColor: { value: new THREE.Vector3(disvEdgeColorVec3.r, disvEdgeColorVec3.g, disvEdgeColorVec3.b) },
  }
});

// ========================================================================== //
// UIs
const gui = new dat.GUI();

// Slider to control dissolve progress for guardMaterial
gui.add(params, 'disvProgress', 0.0, 1.0).step(0.01).onChange((value) => {
  guardMaterial.uniforms.disvProgress.value = value;
});
gui.add(params, 'disvEdgeWidth', 0.0, 0.2).step(0.002).onChange((value) => {
  guardMaterial.uniforms.disvEdgeWidth.value = value;
});
gui.addColor(params, 'disvEdgeColor').onChange((value) => {
  // Convert hex string to a THREE.Color, then to a THREE.Vector3
  const color = new THREE.Color(value);
  guardMaterial.uniforms.disvEdgeColor.value.set(color.r, color.g, color.b);
});
gui.addColor(params, 'particleColor').onChange((value) => {
  const color = new THREE.Color(value);
  particleMaterial.uniforms.particleColor.value.set(color.r, color.g, color.b);
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
`;

// Fragment shader remains similar (using vPosition to compute noise):
const particleFragmentShader = `
  uniform float disvProgress;
  uniform float disvEdgeWidth;
  uniform vec3 particleColor;
  in vec3 vPosition;
  in float vAlpha;

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
    // Compute noise for dissolve effect:
    float noise = perlin_noise_3d(vPosition * 10.0);
    
    // Define the dissolve band:
    float lower = disvProgress;
    float upper = disvProgress + disvEdgeWidth * 2.0; // Make particle gen a bit wider than the edge 
    if (noise > upper || noise < lower) {
      discard;
    }
    
    // Apply color and the fading alpha
    gl_FragColor = vec4(particleColor, vAlpha);
  }
`;

// Create the ShaderMaterial for the particles
const loopDuration = 5.0; // uniform for loop length, in seconds
const particleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0.0 },
    disvProgress: { value: params.disvProgress },
    disvEdgeWidth: { value: params.disvEdgeWidth },
    particleColor: { value: new THREE.Vector3(particleColorVec3.r, particleColorVec3.g, particleColorVec3.b) },
    risingSpeed: { value: 0.1 },
    turbulenceAmplitude: { value: 0.02 },
    fadeStartHeight: { value: 1.8 },
    fadeEndHeight: { value: 2.2 },
    loopDuration: { value: loopDuration },
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
      }

      // Attach these custom attributes to the instanced geometry
      instancedMesh.geometry.setAttribute(
        'instanceBirth',
        new THREE.InstancedBufferAttribute(instanceBirth, 1)
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
