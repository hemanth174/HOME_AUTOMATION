'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createStudioEnvMap } from './three-model-viewer/environment';
import { disposeMaterial } from './three-model-viewer/materials';
import { loadModel } from './three-model-viewer/modelLoaders';

export default function ThreeModelViewer({
  modelType = 'glb', modelPath, mtlPath, autoRotate = false, rotateSpeed = 0.005, isPCB = true
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;
    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 2, 9);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      console.error('WebGL Initialization failed:', err);
      setError('WebGL is not supported or disabled in your browser.');
      setLoading(false);
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isPCB ? 1.4 : 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.useLegacyLights = false;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.maxPolarAngle = modelType === 'pcb-custom' ? Math.PI : (Math.PI / 2 - 0.01);
    controlsRef.current = controls;
    scene.environment = createStudioEnvMap(renderer);

    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemisphereLight.position.set(0, 20, 0);
    scene.add(hemisphereLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(5, 10, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(0, 8, -8);
    scene.add(rimLight);

    const parentGroup = new THREE.Group();
    scene.add(parentGroup);
    let loadedObject = null;
    let animationFrameId = null;

    const centerAndScaleObject = (object) => {
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0 ? 5.5 / maxDim : 1;
      object.position.set(-center.x, -center.y, -center.z);
      parentGroup.scale.set(scale, scale, scale);
      parentGroup.rotation.set(...(modelType === 'pcb-custom' ? [0.65, -0.75, 0.15] : [0.18, -0.5, 0]));
      parentGroup.add(object);
      loadedObject = parentGroup;

      const halfSize = (maxDim * scale) / 2;
      keyLight.shadow.camera.left = -halfSize * 1.5;
      keyLight.shadow.camera.right = halfSize * 1.5;
      keyLight.shadow.camera.top = halfSize * 1.5;
      keyLight.shadow.camera.bottom = -halfSize * 1.5;
      keyLight.shadow.camera.updateProjectionMatrix();
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs((maxDim * scale) / 2 / Math.tan(fov / 2)) * 1.35;
      camera.position.set(...(modelType === 'pcb-custom' ? [0, cameraZ * 0.65, cameraZ * 1.1] : [cameraZ * 0.4, cameraZ * 0.4, cameraZ]));
      camera.far = cameraZ * 10;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.minDistance = maxDim * scale * 0.4;
      controls.maxDistance = cameraZ * 3.0;
      controls.update();
      renderer.compile(scene, camera);
      setLoading(false);
    };

    loadModel({ modelType, modelPath, mtlPath, onLoad: centerAndScaleObject, onError: (message) => {
      setError(message);
      setLoading(false);
    } });

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (loadedObject && autoRotate) loadedObject.rotation.y += rotateSpeed;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        if (!obj.isMesh && !obj.isLineSegments) return;
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(disposeMaterial);
        }
      });
      if (scene.environment) scene.environment.dispose();
      if (renderer) {
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
        renderer.dispose();
      }
    };
  }, [modelType, modelPath, mtlPath, autoRotate, rotateSpeed, isPCB]);

  return (
    <div className="relative w-full h-full min-h-[300px]">
      <div ref={containerRef} className="absolute inset-0 w-full h-full outline-none" />
      {loading && !error && <div className="absolute inset-0 flex flex-col items-center justify-center bg-lp-bg/40 backdrop-blur-sm z-20 pointer-events-none transition-all duration-300">
        <div className="relative flex items-center justify-center"><div className="w-12 h-12 rounded-full border-2 border-lp-primary-container/20 border-t-lp-primary-container animate-spin" /><div className="absolute w-2 h-2 rounded-full bg-lp-primary-container animate-pulse" /></div>
        <span className="mt-4 font-label-caps text-[10px] text-lp-primary-container tracking-[0.25em] uppercase font-bold animate-pulse">Loading CAD Assets...</span>
      </div>}
      {error && <div className="absolute inset-0 flex items-center justify-center bg-lp-bg/60 backdrop-blur-md z-20 p-6">
        <div className="max-w-md w-full rounded-lg border border-status-critical/30 bg-lp-surface-lowest p-6 shadow-2xl flex flex-col items-center text-center">
          <span className="material-symbols-outlined text-status-critical text-4xl mb-3">warning</span>
          <h4 className="text-sm font-label-caps text-white font-bold uppercase tracking-wider mb-2">WebGL Parser Failure</h4>
          <p className="text-xs text-lp-on-surface-variant leading-relaxed mb-4">{error} Please verify that the 3D model resources exist and are parsed correctly.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 border border-lp-outline hover:bg-white/5 transition-all text-[10px] font-label-caps text-white font-bold rounded cursor-pointer">Reload Sandbox</button>
        </div>
      </div>}
    </div>
  );
}
