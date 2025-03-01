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
// The vertex shader simply passes along the particle position.
const particleVertexShader = `
        uniform float time;
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 4.0;
          gl_Position = projectionMatrix * mvPosition;
        }
      `;

// The fragment shader computes Perlin noise based on the particle's position
// and only renders particles when the noise is within the dissolve band.
const particleFragmentShader = `
        uniform float time;
        uniform float disvProgress;
        uniform float disvEdgeWidth;
        varying vec3 vPosition;
        
        // Perlin noise helper functions:
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
          // Compute noise based on the XY of the particle's position (with an optional time offset)
          float noise = perlin_noise(vPosition.xy, 10.0);
          
          // Define the dissolve band (edge threshold)
          float lower = disvProgress;
          float upper = disvProgress + disvEdgeWidth;
          if (noise > upper || noise < lower) {
            discard;
          }
          
          gl_FragColor = vec4(1.0, 0.5, 0.0, 1.0);
        }
      `;

const particleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0.0 },
    disvProgress: { value: params.disvProgress },
    disvEdgeWidth: { value: params.disvEdgeWidth }
  },
  vertexShader: particleVertexShader,
  fragmentShader: particleFragmentShader,
  transparent: true
});

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
      const particleCount = 50000; // Adjust count as needed
      const positions = new Float32Array(particleCount * 3);
      const tempPosition = new THREE.Vector3();

      for (let i = 0; i < particleCount; i++) {
        sampler.sample(tempPosition);
        positions[i * 3 + 0] = tempPosition.x;
        positions[i * 3 + 1] = -tempPosition.y;
        positions[i * 3 + 2] = -tempPosition.z;
      }

      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particleSystem);
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
