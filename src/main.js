import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
camera.position.set(0, 0, 10); // Position the camera

// Add OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth movement
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 2;
controls.maxDistance = 20;

// Create a Sphere
const geometry = new THREE.SphereGeometry(1, 16, 16);
const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: true });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// Animation Loop
function animate() {
  requestAnimationFrame(animate);

  // Update controls on each frame
  controls.update();

  // Rotate the sphere
  sphere.rotation.y += 0.01;

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
