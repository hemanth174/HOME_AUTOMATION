import * as THREE from 'three';

export function disposeMaterial(material) {
  if (!material) return;
  material.dispose();
  for (const key in material) {
    const value = material[key];
    if (value && typeof value.dispose === 'function') value.dispose();
  }
}

export function optimizePCBMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = true;
    if (!child.material) return;

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

      const name = (standardMat.name || '').toLowerCase();
      if (/metal|tin|gold|copper|solder|lead|pin|pad|plated|conductor|chrome|silver/.test(name)) {
        standardMat.roughness = 0.15;
        standardMat.metalness = 0.95;
        standardMat.color.multiplyScalar(1.2);
      } else if (/mask|board|fr4|substrate|pcb/.test(name)) {
        standardMat.roughness = 0.75;
        standardMat.metalness = 0.05;
      } else if (/plastic|body|case|housing/.test(name)) {
        standardMat.roughness = 0.45;
        standardMat.metalness = 0.1;
      } else {
        standardMat.roughness = 0.45;
        standardMat.metalness = 0.15;
      }
      standardMat.envMapIntensity = 1.5;
      return standardMat;
    });
    child.material = Array.isArray(child.material) ? optimized : optimized[0];
  });
}
