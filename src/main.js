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
// Important: if LinearSRGBColorSpace, darker; if SRGBColorSpace, brighter.
// Settings of render targets better match this.
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create scenes
const scene = new THREE.Scene();  // Basic scene
const sceneGlowOnly = new THREE.Scene();  // Scene for post processings - outer glow

// Create a Camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 2, 2);

// Add a grid helper
const gridHelper = new THREE.GridHelper(2, 20);
scene.add(gridHelper);

// Add an axis helper
const axesHelper = new THREE.AxesHelper(0.1);
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
light.intensity = 3.5;
scene.add(light);

const cubeTextureLoader = new THREE.CubeTextureLoader();
const envMap = cubeTextureLoader.load([
  '/cubemap/posx.jpg', '/cubemap/negx.jpg', // +X, -X
  '/cubemap/posy.jpg', '/cubemap/negy.jpg', // +Y, -Y
  '/cubemap/posz.jpg', '/cubemap/negz.jpg'  // +Z, -Z
]);

scene.environment = envMap; // Apply environment map globally
scene.background = envMap;  // Make the cubemap visible by setting it as bg
scene.environment.colorSpace = THREE.SRGBColorSpace;
scene.backgroundIntensity = 2.5;

async function loadShader(url) {
  const response = await fetch(url);
  return await response.text();
}

const params = {
  disvProgress: 0.1,    // Initial value
  disvEdgeWidth: 0.02, // Initial value
  disvEdgeColor: "#520000", // Initial value, has to be hex for dat GUI
  particleColor: "#ffb400", // Initial value, has to be hex for dat GUI
};
const disvEdgeColorVec3 = new THREE.Color(params.disvEdgeColor);  // Convert from hex to Vec3
const particleColorVec3 = new THREE.Color(params.particleColor);  // Convert from hex to Vec3

// ========================================================================== //
// Guard material

const guardVs = await loadShader('glsl/guard.vs.glsl');
const guardFs = await loadShader('glsl/guard.fs.glsl');
const guardMaterial = new THREE.ShaderMaterial({
  vertexShader: guardVs,
  fragmentShader: guardFs,
  uniforms: {
    metalness: { value: 1.0 },
    roughness: { value: 0.1 },
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

// Sliders to control dissolve related parameters
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
const particleSize = 0.005; // Adjust size as needed
// const planeGeometry = new THREE.PlaneGeometry(particleSize, particleSize);
const planeGeometry = new THREE.CircleGeometry(particleSize, 8);

const particleVs = await loadShader('glsl/particle.vs.glsl');
const particleFs = await loadShader('glsl/particle.fs.glsl');

const loopDuration = 5.0; // A uniform, loop length in seconds
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
  vertexShader: particleVs,
  fragmentShader: particleFs,
  depthWrite: false,
  transparent: true
});

const particleLifeRange = 10.0;

// ========================================================================== //
// FBX model setup
const loader = new FBXLoader();
let particles = null;
loader.load(
  '/guard.fbx', // Path relative to the public/ folder
  (fbx) => {
    fbx.scale.set(1.0, 1.0, 1.0);
    fbx.position.set(0.0, 0.0, 0.0);

    fbx.traverse((child) => {
      if (child.isMesh) {
        child.material = guardMaterial;
        child.material.needsUpdate = true;
      }
    });

    scene.add(fbx);

    // Sample the model's surface to generate particle positions
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
      const particleCount = 40000;
      particles = new THREE.InstancedMesh(planeGeometry, particleMaterial, particleCount);

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
        particles.setMatrixAt(i, dummy.matrix);

        // Set a random birth time (delay) and a lifetime for this particle
        instanceBirth[i] = Math.random() * particleLifeRange;
      }

      // Attach these custom attributes to the instanced geometry
      particles.geometry.setAttribute(
        'instanceBirth',
        new THREE.InstancedBufferAttribute(instanceBirth, 1)
      );

      sceneGlowOnly.add(particles);
    }
  },
  (xhr) => {
    console.log(`FBX Loading: ${(xhr.loaded / xhr.total) * 100}% loaded`);
  },
  (error) => {
    console.error('Error loading FBX:', error);
  }
);

// ========================================================================== //
// Post processings

// Notice that we downsample by making the renderTargetGlow small sized so glow will be smoother
const renderTargetGlow = new THREE.WebGLRenderTarget(window.innerWidth / 2, window.innerHeight / 2, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.HalfFloatType,
  colorSpace: THREE.SRGBColorSpace // Explicitly linear
});
const renderTargetBlur = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.HalfFloatType,
  colorSpace: THREE.SRGBColorSpace // Explicitly linear
});
const renderTargetBase = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.HalfFloatType,
  colorSpace: THREE.SRGBColorSpace // Explicitly linear
});

const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(postCamera);
const screenGeometry = new THREE.PlaneGeometry(2, 2);
const screenQuad = new THREE.Mesh(screenGeometry, null); // we'll assign materials later
postScene.add(screenQuad);
const debugViewMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: renderTargetGlow.texture }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;

    void main() {
      vec4 texColor = texture2D(tDiffuse, vUv);
      gl_FragColor = texColor;
    }
  `,
  depthWrite: false
});

const blurVs = await loadShader('glsl/blur.vs.glsl');
const blurFs = await loadShader('glsl/blur.fs.glsl');
const blurMaterialH = new THREE.ShaderMaterial({
  vertexShader: blurVs,
  fragmentShader: blurFs,
  uniforms: {
    tDiffuse: { value: null },
    uDirection: { value: new THREE.Vector2(1.0, 0.0) },
    uBlurAmount: { value: 2.5 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
  }
});
const blurMaterialV = blurMaterialH.clone();
blurMaterialV.uniforms.uDirection.value = new THREE.Vector2(0.0, 1.0);

const addBlurFs = await loadShader('glsl/addBlur.fs.glsl');
const addMaterial = new THREE.ShaderMaterial({
  vertexShader: blurVs,
  fragmentShader: addBlurFs,
  uniforms: {
    tBase: { value: null },
    tGlow: { value: null }
  }
});

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

  // STEP 1: Render glow (particles only) to first target
  renderer.setRenderTarget(renderTargetGlow);
  renderer.clear();
  renderer.render(sceneGlowOnly, camera); // just particles

  // STEP 2: Apply horizontal blur (ping in pingpong)
  screenQuad.material = blurMaterialH;
  blurMaterialH.uniforms.tDiffuse.value = renderTargetGlow.texture;
  renderer.setRenderTarget(renderTargetBlur);
  renderer.render(postScene, postCamera);

  // STEP 3: Apply vertical blur (pong in pingpong)
  screenQuad.material = blurMaterialV;
  blurMaterialV.uniforms.tDiffuse.value = renderTargetBlur.texture;
  renderer.setRenderTarget(renderTargetGlow);
  renderer.render(postScene, postCamera);

  // STEP 4: Render main scene to screen
  renderer.setRenderTarget(renderTargetBase);
  renderer.clear();
  renderer.render(scene, camera);

  const oldAutoClear = renderer.autoClear;
  renderer.autoClear = false; // Important: Prevent clearing the existing content

  // sceneGlowOnly has a null background and particles use AdditiveBlending.
  // They will be added to the existing content of renderTargetBase.
  renderer.render(sceneGlowOnly, camera);

  renderer.autoClear = oldAutoClear; // Restore the default autoClear behavior

  // DEBUG STEP: Visualize the FBO output
  /* renderer.setRenderTarget(null);
  screenQuad.material = debugViewMaterial;
  debugViewMaterial.uniforms.tDiffuse.value = renderTargetBase.texture;
  renderer.render(postScene, postCamera); */

  // STEP 5: Composite the base scene (with sharp particles) and the blurred glow to the screen.
  renderer.setRenderTarget(null); // Render to the actual screen/canvas
  renderer.clear(); // Clear the screen before drawing the final image

  screenQuad.material = addMaterial; // Use your shader that adds two textures
  addMaterial.uniforms.tBase.value = renderTargetBase.texture; // Main scene + sharp particles
  addMaterial.uniforms.tGlow.value = renderTargetGlow.texture; // Blurred particles
  renderer.render(postScene, postCamera);

  // renderer.render(scene, camera);
}

// Handle Window Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  blurMaterialH.uniforms.uResolution.value.set(width, height);
  blurMaterialV.uniforms.uResolution.value.set(width, height);
});

// Start Animation
animate();
