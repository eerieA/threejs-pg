import * as THREE from 'three';
import * as dat from 'dat.gui';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

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
  },
  (xhr) => {
    console.log(`FBX Loading: ${(xhr.loaded / xhr.total) * 100}% loaded`);
  },
  (error) => {
    console.error('Error loading FBX:', error);
  }
);

// ========================================================================== //
// UIs
const gui = new dat.GUI();

// Slider to control dissolve progress for guardMaterial
const params = {
  disvProgress: 0.1,    // Initial value
  disvEdgeWidth: 0.05, // Initial value
  disvEdgeColor: "#ff0000" // Initial value, has to be hex for dat GUI
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

// Animation Loop
function animate() {
  requestAnimationFrame(animate);

  // Update controls on each frame
  controls.update();

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
