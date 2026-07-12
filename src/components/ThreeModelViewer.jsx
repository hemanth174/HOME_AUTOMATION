'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

/**
 * Parses raw DXF text format into segment line vertex coordinates.
 * Supports: LINE, LWPOLYLINE, CIRCLE, and ARC.
 */
function parseDXF(text) {
  const lines = text.split(/\r?\n/);
  const segments = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i++;
      continue;
    }
    const code = parseInt(line.trim(), 10);
    const val = lines[i+1] ? lines[i+1].trim() : '';
    
    if (code === 0 && val === 'LINE') {
      let x1 = 0, y1 = 0, z1 = 0, x2 = 0, y2 = 0, z2 = 0;
      i += 2;
      while (i < lines.length) {
        if (!lines[i]) { i++; continue; }
        const c = parseInt(lines[i].trim(), 10);
        const v = lines[i+1] ? lines[i+1].trim() : '';
        if (c === 0) {
          i -= 2;
          break;
        }
        if (c === 10) x1 = parseFloat(v);
        if (c === 20) y1 = parseFloat(v);
        if (c === 30) z1 = parseFloat(v);
        if (c === 11) x2 = parseFloat(v);
        if (c === 21) y2 = parseFloat(v);
        if (c === 31) z2 = parseFloat(v);
        i += 2;
      }
      segments.push(x1, y1, z1, x2, y2, z2);
    } else if (code === 0 && val === 'LWPOLYLINE') {
      const vertices = [];
      let elevation = 0;
      let closed = false;
      i += 2;
      while (i < lines.length) {
        if (!lines[i]) { i++; continue; }
        const c = parseInt(lines[i].trim(), 10);
        const v = lines[i+1] ? lines[i+1].trim() : '';
        if (c === 0) {
          i -= 2;
          break;
        }
        if (c === 70) {
          const flags = parseInt(v, 10);
          closed = (flags & 1) === 1;
        }
        if (c === 10) vertices.push({ x: parseFloat(v), y: 0 });
        if (c === 20) {
          if (vertices.length > 0) vertices[vertices.length - 1].y = parseFloat(v);
        }
        if (c === 38) elevation = parseFloat(v);
        i += 2;
      }
      for (let k = 0; k < vertices.length - 1; k++) {
        segments.push(vertices[k].x, vertices[k].y, elevation, vertices[k+1].x, vertices[k+1].y, elevation);
      }
      if (closed && vertices.length > 1) {
        segments.push(vertices[vertices.length - 1].x, vertices[vertices.length - 1].y, elevation, vertices[0].x, vertices[0].y, elevation);
      }
    } else if (code === 0 && val === 'CIRCLE') {
      let cx = 0, cy = 0, cz = 0, r = 0;
      i += 2;
      while (i < lines.length) {
        if (!lines[i]) { i++; continue; }
        const c = parseInt(lines[i].trim(), 10);
        const v = lines[i+1] ? lines[i+1].trim() : '';
        if (c === 0) {
          i -= 2;
          break;
        }
        if (c === 10) cx = parseFloat(v);
        if (c === 20) cy = parseFloat(v);
        if (c === 30) cz = parseFloat(v);
        if (c === 40) r = parseFloat(v);
        i += 2;
      }
      const steps = 32;
      for (let k = 0; k < steps; k++) {
        const theta1 = (k / steps) * Math.PI * 2;
        const theta2 = ((k + 1) / steps) * Math.PI * 2;
        segments.push(
          cx + Math.cos(theta1) * r, cy + Math.sin(theta1) * r, cz,
          cx + Math.cos(theta2) * r, cy + Math.sin(theta2) * r, cz
        );
      }
    } else if (code === 0 && val === 'ARC') {
      let cx = 0, cy = 0, cz = 0, r = 0, startAngle = 0, endAngle = 360;
      i += 2;
      while (i < lines.length) {
        if (!lines[i]) { i++; continue; }
        const c = parseInt(lines[i].trim(), 10);
        const v = lines[i+1] ? lines[i+1].trim() : '';
        if (c === 0) {
          i -= 2;
          break;
        }
        if (c === 10) cx = parseFloat(v);
        if (c === 20) cy = parseFloat(v);
        if (c === 30) cz = parseFloat(v);
        if (c === 40) r = parseFloat(v);
        if (c === 50) startAngle = parseFloat(v);
        if (c === 51) endAngle = parseFloat(v);
        i += 2;
      }
      if (endAngle < startAngle) endAngle += 360;
      const steps = 16;
      for (let k = 0; k < steps; k++) {
        const t1 = startAngle + (k / steps) * (endAngle - startAngle);
        const t2 = startAngle + ((k + 1) / steps) * (endAngle - startAngle);
        const theta1 = (t1 * Math.PI) / 180;
        const theta2 = (t2 * Math.PI) / 180;
        segments.push(
          cx + Math.cos(theta1) * r, cy + Math.sin(theta1) * r, cz,
          cx + Math.cos(theta2) * r, cy + Math.sin(theta2) * r, cz
        );
      }
    }
    i += 2;
  }
  return segments;
}

/**
 * Recursively disposes Three.js materials to prevent GPU memory leaks
 */
const disposeMaterial = (material) => {
  if (!material) return;
  material.dispose();
  for (const key in material) {
    const value = material[key];
    if (value && typeof value.dispose === 'function') {
      value.dispose();
    }
  }
};

/**
 * Dynamically builds a studio light reflection canvas and maps it to a PMREM env map.
 * Simulates high-fidelity metallic specular highlight panels on components.
 */
function createStudioEnvMap(renderer) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Ground ambient fill
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#101216');
  grad.addColorStop(1, '#050608');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Softbox ceiling light
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(180, 10, 150, 45);

  // Left studio reflector
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(40, 45, 75, 160);

  // Right cool-white studio reflector
  ctx.fillStyle = '#eaf5ff';
  ctx.fillRect(390, 45, 75, 160);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const envMap = pmremGenerator.fromEquirectangular(texture).texture;
  
  texture.dispose();
  pmremGenerator.dispose();

  return envMap;
}

export default function ThreeModelViewer({
  modelType = 'glb',
  modelPath,
  mtlPath,
  autoRotate = false,
  rotateSpeed = 0.005,
  isPCB = true
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Initial Dimensions
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    // 2. Scene setup
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background

    // 3. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 2, 9);

    // 4. Renderer setup
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
    } catch (err) {
      console.error('WebGL Initialization failed:', err);
      setError('WebGL is not supported or disabled in your browser.');
      setLoading(false);
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Modern color management APIs
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isPCB ? 1.4 : 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Equivalent of legacy physicallyCorrectLights
    renderer.useLegacyLights = false;

    // Append canvas
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 5. OrbitControls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.maxPolarAngle = modelType === 'pcb-custom' ? Math.PI : (Math.PI / 2 - 0.01); // Allow full vertical orbit for custom pcb back textures
    controlsRef.current = controls;

    // 6. Dynamic Studio Environment Map Setup
    const envMap = createStudioEnvMap(renderer);
    scene.environment = envMap;

    // 7. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemisphereLight.position.set(0, 20, 0);
    scene.add(hemisphereLight);

    // Key Light
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(5, 10, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    // Fill Light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Rim Light (Specular highlights on edges)
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(0, 8, -8);
    scene.add(rimLight);

    // 8. Loaders & Models Group
    const parentGroup = new THREE.Group();
    scene.add(parentGroup);

    let loadedObject = null;
    let animationFrameId = null;

    /**
     * Traverses meshes to enforce casting/receiving shadows, frustum culling,
     * and maps legacy Phong materials to standard physically-based PBR materials.
     */
    const optimizePCBMaterials = (object) => {
      object.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = true;

          if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            const optimized = materials.map((mat) => {
              let standardMat = mat;

              if (!mat.isMeshStandardMaterial) {
                standardMat = new THREE.MeshStandardMaterial({
                  color: mat.color,
                  map: mat.map,
                  normalMap: mat.normalMap,
                  emissive: mat.emissive,
                  opacity: mat.opacity,
                  transparent: mat.transparent,
                  side: THREE.DoubleSide
                });
                mat.dispose();
              } else {
                standardMat.side = THREE.DoubleSide;
              }

              // Apply dynamic PBR parameterization by analyzing CAD node labels
              const name = (standardMat.name || '').toLowerCase();
              if (
                name.includes('metal') || 
                name.includes('tin') || 
                name.includes('gold') || 
                name.includes('copper') || 
                name.includes('solder') || 
                name.includes('lead') || 
                name.includes('pin') || 
                name.includes('pad') || 
                name.includes('plated') || 
                name.includes('conductor') ||
                name.includes('chrome') ||
                name.includes('silver')
              ) {
                // Highly specular metal leads/pads
                standardMat.roughness = 0.15;
                standardMat.metalness = 0.95;
                standardMat.color.multiplyScalar(1.2);
              } else if (
                name.includes('mask') || 
                name.includes('board') || 
                name.includes('fr4') || 
                name.includes('substrate') || 
                name.includes('pcb')
              ) {
                // High roughness matte fiberglass board
                standardMat.roughness = 0.75;
                standardMat.metalness = 0.05;
              } else if (
                name.includes('plastic') || 
                name.includes('body') || 
                name.includes('case') || 
                name.includes('housing')
              ) {
                // Semi-gloss plastic relays/connectors
                standardMat.roughness = 0.45;
                standardMat.metalness = 0.1;
              } else {
                // Generic component parameters
                standardMat.roughness = 0.45;
                standardMat.metalness = 0.15;
              }

              // Elevate reflection panels intensity
              standardMat.envMapIntensity = 1.5;

              return standardMat;
            });

            child.material = Array.isArray(child.material) ? optimized : optimized[0];
          }
        }
      });
    };

    /**
     * Centers geometry center, scales to normalized layout bounding box dimensions,
     * calculates projection framing values, and compiles WebGL pipelines.
     */
    const centerAndScaleObject = (object) => {
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      const maxDim = Math.max(size.x, size.y, size.z);
      let scale = 1;
      if (maxDim > 0) {
        scale = 5.5 / maxDim;
      }

      // 1. Shift child coordinates to relative group origin
      object.position.set(-center.x, -center.y, -center.z);
      
      // 2. Apply scale factor on parent level
      parentGroup.scale.set(scale, scale, scale);

      // 3. Set custom starting isometric rotation tilt
      if (modelType === 'pcb-custom') {
        parentGroup.rotation.set(0.65, -0.75, 0.15); // Match user screenshot positioning
      } else {
        parentGroup.rotation.set(0.18, -0.5, 0);
      }

      // 4. Attach child
      parentGroup.add(object);
      loadedObject = parentGroup;

      // 5. Adjust key light camera shadow size based on bounding box
      const halfSize = (maxDim * scale) / 2;
      keyLight.shadow.camera.left = -halfSize * 1.5;
      keyLight.shadow.camera.right = halfSize * 1.5;
      keyLight.shadow.camera.top = halfSize * 1.5;
      keyLight.shadow.camera.bottom = -halfSize * 1.5;
      keyLight.shadow.camera.updateProjectionMatrix();

      // 6. Framing math to auto zoom/fit model
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs((maxDim * scale) / 2 / Math.tan(fov / 2));
      cameraZ *= 1.35; // margin factor

      if (modelType === 'pcb-custom') {
        camera.position.set(0, cameraZ * 0.65, cameraZ * 1.1); // Centered diagonal perspective
      } else {
        camera.position.set(cameraZ * 0.4, cameraZ * 0.4, cameraZ);
      }
      camera.far = cameraZ * 10;
      camera.updateProjectionMatrix();

      controls.target.set(0, 0, 0);
      controls.minDistance = maxDim * scale * 0.4;
      controls.maxDistance = cameraZ * 3.0;
      controls.update();

      // 7. Warm shaders cache
      renderer.compile(scene, camera);

      setLoading(false);
    };

    // Load Model File branches
    if (modelType === 'glb') {
      const gltfLoader = new GLTFLoader();
      gltfLoader.load(
        modelPath,
        (gltf) => {
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.frustumCulled = true;
              if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach((mat) => {
                  mat.envMapIntensity = 1.5;
                });
              }
            }
          });
          centerAndScaleObject(gltf.scene);
        },
        undefined,
        (err) => {
          console.error('Error loading GLB model:', err);
          setError('Failed to parse 3D assets.');
          setLoading(false);
        }
      );
    } else if (modelType === 'obj') {
      const mtlLoader = new MTLLoader();
      mtlLoader.load(
        mtlPath,
        (materials) => {
          materials.preload();
          const objLoader = new OBJLoader();
          objLoader.setMaterials(materials);
          objLoader.load(
            modelPath,
            (object) => {
              optimizePCBMaterials(object);
              centerAndScaleObject(object);
            },
            undefined,
            (err) => {
              console.error('Error loading OBJ model:', err);
              setError('Failed to parse OBJ file.');
              setLoading(false);
            }
          );
        },
        undefined,
        (err) => {
          console.error('Error preloading MTL materials:', err);
          setError('Failed to parse MTL library.');
          setLoading(false);
        }
      );
    } else if (modelType === 'dxf') {
      fetch(modelPath)
        .then((response) => {
          if (!response.ok) throw new Error(`Status: ${response.status}`);
          return response.text();
        })
        .then((text) => {
          const segments = parseDXF(text);
          if (segments.length === 0) {
            throw new Error('No lines found inside DXF.');
          }

          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments), 3));

          const material = new THREE.LineBasicMaterial({
            color: 0xd4d4d8, // Monochromatic Silver/Zinc-300 schematic traces
            transparent: true,
            opacity: 0.85
          });

          const lineSegments = new THREE.LineSegments(geometry, material);
          centerAndScaleObject(lineSegments);
        })
        .catch((err) => {
          console.error('Error loading DXF vector file:', err);
          setError('Failed to parse DXF drawing.');
          setLoading(false);
        });
    } else if (modelType === 'pcb-custom') {
      const textureLoader = new THREE.TextureLoader();
      Promise.all([
        new Promise((resolve, reject) => textureLoader.load('/models/pcb_custom_front.png', resolve, undefined, reject)),
        new Promise((resolve, reject) => textureLoader.load('/models/pcb_custom_back.png', resolve, undefined, reject))
      ]).then(([frontTex, backTex]) => {
        frontTex.colorSpace = THREE.SRGBColorSpace;
        backTex.colorSpace = THREE.SRGBColorSpace;

        const sideMaterial = new THREE.MeshStandardMaterial({
          color: 0x0c1e30, // Deep PCB blue matching the image background
          roughness: 0.8,
          metalness: 0.1
        });

        const topMaterial = new THREE.MeshStandardMaterial({
          map: frontTex,
          roughness: 0.35,
          metalness: 0.25,
          envMapIntensity: 1.6
        });

        const bottomMaterial = new THREE.MeshStandardMaterial({
          map: backTex,
          roughness: 0.35,
          metalness: 0.25,
          envMapIntensity: 1.6
        });

        const materials = [
          sideMaterial, // +X (Right)
          sideMaterial, // -X (Left)
          topMaterial,    // +Y (Top/Front)
          bottomMaterial, // -Y (Bottom/Back)
          sideMaterial, // +Z
          sideMaterial  // -Z
        ];

        // Aspect ratio: 1000/422 = ~2.37. Use width=9.5, height=0.12, depth=4.0
        const geometry = new THREE.BoxGeometry(9.5, 0.12, 4.0);
        const boardMesh = new THREE.Mesh(geometry, materials);
        boardMesh.castShadow = true;
        boardMesh.receiveShadow = true;

        centerAndScaleObject(boardMesh);
      }).catch((err) => {
        console.error('Error loading custom PCB textures:', err);
        setError('Failed to load custom PCB 3D textures.');
        setLoading(false);
      });
    }

    // 9. Animation Frame loop
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (loadedObject && autoRotate) {
        loadedObject.rotation.y += rotateSpeed;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 10. Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
        }
      }
    });
    resizeObserver.observe(container);

    // 11. Cleanup routine to avoid memory leaks
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();

      scene.traverse((obj) => {
        if (!obj.isMesh && !obj.isLineSegments) return;

        if (obj.geometry) obj.geometry.dispose();

        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => disposeMaterial(mat));
          } else {
            disposeMaterial(obj.material);
          }
        }
      });

      if (scene.environment) {
        scene.environment.dispose();
      }

      if (renderer) {
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
      }
    };
  }, [modelType, modelPath, mtlPath, autoRotate, rotateSpeed, isPCB]);

  return (
    <div className="relative w-full h-full min-h-[300px]">
      {/* 3D Canvas Mount */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full outline-none" />

      {/* Loading Overlay */}
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-lp-bg/40 backdrop-blur-sm z-20 pointer-events-none transition-all duration-300">
          <div className="relative flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-lp-primary-container/20 border-t-lp-primary-container animate-spin" />
            <div className="absolute w-2 h-2 rounded-full bg-lp-primary-container animate-pulse" />
          </div>
          <span className="mt-4 font-label-caps text-[10px] text-lp-primary-container tracking-[0.25em] uppercase font-bold animate-pulse">
            Loading CAD Assets...
          </span>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-lp-bg/60 backdrop-blur-md z-20 p-6">
          <div className="max-w-md w-full rounded-lg border border-status-critical/30 bg-lp-surface-lowest p-6 shadow-2xl flex flex-col items-center text-center">
            <span className="material-symbols-outlined text-status-critical text-4xl mb-3">
              warning
            </span>
            <h4 className="text-sm font-label-caps text-white font-bold uppercase tracking-wider mb-2">
              WebGL Parser Failure
            </h4>
            <p className="text-xs text-lp-on-surface-variant leading-relaxed mb-4">
              {error} Please verify that the 3D model resources exist and are parsed correctly.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 border border-lp-outline hover:bg-white/5 transition-all text-[10px] font-label-caps text-white font-bold rounded cursor-pointer"
            >
              Reload Sandbox
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
