import React, { useCallback, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LOOKS, MiniApi, Who, Zone } from './catalog';
import { MiniCharacter } from './MiniCharacter';
import { PuppetCharacter } from './PuppetCharacter';
import { TOON_RAMP } from './shapes';

// The region that must always be on screen: both minis side by side plus
// headroom for the floating emoji.
const HALF_WIDTH = 1.0;
const HALF_HEIGHT = 1.12;
const CENTER_Y = 0.93;

const BASE_X: Record<Who, number> = { him: -0.5, her: 0.5 };
// The procedural fallback is smaller than the PNG puppets; scale it to match.
const FALLBACK_SCALE = 1.3;

/** Pulls the camera back until the minis fit, whatever the canvas aspect. */
const CameraFit: React.FC = () => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(HALF_HEIGHT / tanHalf, HALF_WIDTH / (tanHalf * aspect));
    camera.position.set(0, CENTER_Y + 0.1, distance);
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

const MiniWorldScene: React.FC<SceneProps> = ({ register, onTouch, onEmit }) => {
  // Anyone whose PNGs aren't in public/mini/<who>/ falls back to the 3D chibi.
  const [fallback, setFallback] = useState<Record<Who, boolean>>({ him: false, her: false });
  const onUnavailable = useCallback((who: Who) => setFallback((f) => ({ ...f, [who]: true })), []);

  return (
    <Canvas dpr={[1, 1.75]} camera={{ fov: 30 }} gl={{ antialias: true, powerPreference: 'low-power' }}>
      <CameraFit />
      <ambientLight intensity={1.2} />
      <directionalLight position={[2, 4, 3]} intensity={2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <circleGeometry args={[1.3, 48]} />
        <meshToonMaterial color="#3a2457" gradientMap={TOON_RAMP} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0.05]}>
        <ringGeometry args={[0.9, 0.97, 48]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.35} />
      </mesh>

      {(['him', 'her'] as Who[]).map((who) =>
        fallback[who] ? (
          <group key={who} scale={FALLBACK_SCALE}>
            <MiniCharacter
              who={who}
              look={LOOKS[who]}
              baseX={BASE_X[who] / FALLBACK_SCALE}
              register={register}
              onTouch={onTouch}
              onEmit={onEmit}
            />
          </group>
        ) : (
          <PuppetCharacter
            key={who}
            who={who}
            baseX={BASE_X[who]}
            register={register}
            onTouch={onTouch}
            onEmit={onEmit}
            onUnavailable={onUnavailable}
          />
        ),
      )}
    </Canvas>
  );
};

export default MiniWorldScene;
