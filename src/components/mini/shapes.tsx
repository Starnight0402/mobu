import React from 'react';
import * as THREE from 'three';

// Three-step ramp gives a flat cel-shaded look instead of smooth plastic.
export const TOON_RAMP = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

const OUTLINE = new THREE.MeshBasicMaterial({ color: '#150d1f', side: THREE.BackSide });

/** Unit-ish heart (about 0.1 wide), centered, point down. */
export const HEART_GEOMETRY = (() => {
  const s = new THREE.Shape();
  s.moveTo(5, 5);
  s.bezierCurveTo(5, 5, 4, 0, 0, 0);
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  s.bezierCurveTo(16, 7, 16, 0, 10, 0);
  s.bezierCurveTo(7, 0, 5, 5, 5, 5);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 3,
    bevelEnabled: true,
    bevelSize: 1.5,
    bevelThickness: 1.5,
    bevelSegments: 3,
  });
  g.center();
  g.rotateZ(Math.PI);
  g.scale(0.005, 0.005, 0.005);
  return g;
})();

interface ToonProps {
  position?: [number, number, number];
  scale?: number | [number, number, number];
  rotation?: [number, number, number];
  color: string;
  outline?: boolean;
  children: React.ReactNode;
}

/** A toon-shaded mesh, optionally with an inverted-hull outline. */
export const Toon: React.FC<ToonProps> = ({ position, scale, rotation, color, outline = true, children }) => (
  <group position={position} scale={scale} rotation={rotation}>
    <mesh>
      {children}
      <meshToonMaterial color={color} gradientMap={TOON_RAMP} />
    </mesh>
    {outline && (
      <mesh scale={1.07} material={OUTLINE}>
        {children}
      </mesh>
    )}
  </group>
);
