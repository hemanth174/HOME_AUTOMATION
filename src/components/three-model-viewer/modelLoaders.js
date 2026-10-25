import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { parseDXF } from './dxf';
import { optimizePCBMaterials } from './materials';

function loadGLB(modelPath, onLoad, onError) {
  new GLTFLoader().load(modelPath, (gltf) => {
    gltf.scene.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => { material.envMapIntensity = 1.5; });
      }
    });
    onLoad(gltf.scene);
  }, undefined, (err) => {
    console.error('Error loading GLB model:', err);
    onError('Failed to parse 3D assets.');
  });
}

function loadOBJ(modelPath, mtlPath, onLoad, onError) {
  new MTLLoader().load(mtlPath, (materials) => {
    materials.preload();
    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.load(modelPath, (object) => {
      optimizePCBMaterials(object);
      onLoad(object);
    }, undefined, (err) => {
      console.error('Error loading OBJ model:', err);
      onError('Failed to parse OBJ file.');
    });
  }, undefined, (err) => {
    console.error('Error preloading MTL materials:', err);
    onError('Failed to parse MTL library.');
  });
}

function loadDXF(modelPath, onLoad, onError) {
  fetch(modelPath)
    .then((response) => {
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      return response.text();
    })
    .then((text) => {
      const segments = parseDXF(text);
      if (segments.length === 0) throw new Error('No lines found inside DXF.');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments), 3));
      const material = new THREE.LineBasicMaterial({ color: 0xd4d4d8, transparent: true, opacity: 0.85 });
      onLoad(new THREE.LineSegments(geometry, material));
    })
    .catch((err) => {
      console.error('Error loading DXF vector file:', err);
      onError('Failed to parse DXF drawing.');
    });
}

function loadCustomPCB(onLoad, onError) {
  const textureLoader = new THREE.TextureLoader();
  Promise.all([
    new Promise((resolve, reject) => textureLoader.load('/models/pcb_custom_front.png', resolve, undefined, reject)),
    new Promise((resolve, reject) => textureLoader.load('/models/pcb_custom_back.png', resolve, undefined, reject))
  ]).then(([frontTex, backTex]) => {
    frontTex.colorSpace = THREE.SRGBColorSpace;
    backTex.colorSpace = THREE.SRGBColorSpace;
    const sideMaterial = new THREE.MeshStandardMaterial({ color: 0x0c1e30, roughness: 0.8, metalness: 0.1 });
    const topMaterial = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.35, metalness: 0.25, envMapIntensity: 1.6 });
    const bottomMaterial = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.35, metalness: 0.25, envMapIntensity: 1.6 });
    const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.12, 4.0), [
      sideMaterial, sideMaterial, topMaterial, bottomMaterial, sideMaterial, sideMaterial
    ]);
    boardMesh.castShadow = true;
    boardMesh.receiveShadow = true;
    onLoad(boardMesh);
  }).catch((err) => {
    console.error('Error loading custom PCB textures:', err);
    onError('Failed to load custom PCB 3D textures.');
  });
}

export function loadModel({ modelType, modelPath, mtlPath, onLoad, onError }) {
  if (modelType === 'glb') loadGLB(modelPath, onLoad, onError);
  else if (modelType === 'obj') loadOBJ(modelPath, mtlPath, onLoad, onError);
  else if (modelType === 'dxf') loadDXF(modelPath, onLoad, onError);
  else if (modelType === 'pcb-custom') loadCustomPCB(onLoad, onError);
}
