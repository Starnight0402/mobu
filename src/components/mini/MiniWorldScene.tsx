import React, { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LOOKS, MiniApi, Who, Zone } from './catalog';
import { MiniCharacter } from './MiniCharacter';
import { TOON_RAMP } from './shapes';

// The region that must always be on screen: both minis side by side plus
// headroom for the floating emoji.
const HALF_WIDTH = 1.08;
const HALF_HEIGHT = 0.95;
const CENTER_Y = 0.8;

/** Pulls the camera back until the minis fit, whatever the canvas aspect. */
const CameraFit: React.FC = () => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(HALF_HEIGHT / tanHalf, HALF_WIDTH / (tanHalf * aspect));
    camera.position.set(0, CENTER_Y + 0.15, distance);
    camera.lookAt(0, CENTER_Y, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);

  return null;
};

interface SceneProps {
  register: (who: Who, api: MiniApi | null) => void;
  onTouch: (who: Who, zone: Zone) => void;
  onEmit: (emojis: string[], x: number, y: number) => void;
}

const MiniWorldScene: React.FC<SceneProps> = ({ register, onTouch, onEmit }) => (
  <Canvas dpr={[1, 1.75]} camera={{ fov: 30 }} gl={{ antialias: true, powerPreference: 'low-power' }}>
    <CameraFit />
    <ambientLight intensity={1.2} />
    <directionalLight position={[2, 4, 3]} intensity={2} />

    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
      <circleGeometry args={[1.25, 48]} />
      <meshToonMaterial color="#3a2457" gradientMap={TOON_RAMP} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0.05]}>
      <ringGeometry args={[0.85, 0.92, 48]} />
      <meshBasicMaterial color="#a855f7" transparent opacity={0.35} />
    </mesh>

    {(['him', 'her'] as Who[]).map((who) => (
      <MiniCharacter
        key={who}
        who={who}
        look={LOOKS[who]}
        baseX={who === 'him' ? -0.5 : 0.5}
        register={register}
        onTouch={onTouch}
        onEmit={onEmit}
      />
    ))}
  </Canvas>
);

export default MiniWorldScene;
