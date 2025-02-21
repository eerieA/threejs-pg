import * as THREE from 'three';
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
light.position.set(5, 5, 5);
scene.add(light);

const cubeTextureLoader = new THREE.CubeTextureLoader();
const envMap = cubeTextureLoader.load([
  '/cubemap/posx.jpg', '/cubemap/negx.jpg', // +X, -X
  '/cubemap/posy.jpg', '/cubemap/negy.jpg', // +Y, -Y
  '/cubemap/posz.jpg', '/cubemap/negz.jpg'  // +Z, -Z
]);

scene.environment = envMap; // Apply environment map globally
scene.background = envMap;  // Make the cubemap visible by setting it as bg

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
        child.material = new THREE.MeshStandardMaterial({
          color: 0xdddddd, // Light gray metal
          metalness: 1.0,  // Fully metallic
          roughness: 0.15
        });
        child.material.envMap = envMap;
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
