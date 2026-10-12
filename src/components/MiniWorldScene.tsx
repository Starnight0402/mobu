import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

const REACTION_SECONDS = 1.1;

interface Look {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  dress: boolean;
  beard: boolean;
  longHair: boolean;
}

const HIM: Look = {
  skin: '#e8b48f',
  hair: '#2b1d17',
  top: '#a855f7',
  bottom: '#2f3a55',
  dress: false,
  beard: true,
  longHair: false,
};

const HER: Look = {
  skin: '#f0c4a3',
  hair: '#1c1412',
  top: '#f472b6',
  bottom: '#f472b6',
  dress: true,
  beard: false,
  longHair: true,
};

// Three-step ramp gives the flat cel-shaded look instead of smooth plastic.
function makeToonRamp(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const OUTLINE = new THREE.MeshBasicMaterial({ color: '#150d1f', side: THREE.BackSide });

interface PartProps {
  position?: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  ramp: THREE.Texture;
  outline?: boolean;
  children: React.ReactNode;
}

/** A toon-shaded mesh with an inverted-hull outline. */
const Part: React.FC<PartProps> = ({ position, scale, rotation, color, ramp, outline = true, children }) => (
  <group position={position} scale={scale} rotation={rotation}>
    <mesh>
      {children}
      <meshToonMaterial color={color} gradientMap={ramp} />
    </mesh>
    {outline && (
      <mesh scale={1.07} material={OUTLINE}>
        {React.Children.map(children, (c) => c)}
      </mesh>
    )}
  </group>
);

interface MiniProps {
  look: Look;
  x: number;
  faceY: number;
  onTap: (clientX: number, clientY: number) => void;
}

const Mini: React.FC<MiniProps> = ({ look, x, faceY, onTap }) => {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const cheeks = useRef<THREE.Group>(null);
  const reaction = useRef(0);
  const blinkAt = useRef(2 + Math.random() * 3);
  const clock = useRef(Math.random() * 10);
  const ramp = useMemo(makeToonRamp, []);

  useFrame((_, delta) => {
    clock.current += delta;
    const t = clock.current;

    let hop = 0;
    let happy = 0;
    let wave = 0;
    if (reaction.current > 0) {
      reaction.current = Math.max(0, reaction.current - delta);
      const p = 1 - reaction.current / REACTION_SECONDS;
      hop = Math.abs(Math.sin(p * Math.PI * 2)) * 0.14 * (1 - p);
      happy = Math.sin(Math.min(1, p * 1.5) * Math.PI);
      wave = happy;
    }

    if (group.current) group.current.position.y = hop;
    if (body.current) body.current.scale.set(1, 1 + Math.sin(t * 1.8) * 0.015, 1);
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 0.9) * 0.04 + happy * Math.sin(t * 14) * 0.05;
    }
    if (armL.current) armL.current.rotation.z = -0.15 - Math.sin(t * 1.8) * 0.03;
    if (armR.current) {
      armR.current.rotation.z = 0.15 + Math.sin(t * 1.8) * 0.03 + wave * (2.3 + Math.sin(t * 22) * 0.3);
    }

    blinkAt.current -= delta;
    const blinking = blinkAt.current < 0.12 && blinkAt.current > 0;
    if (blinkAt.current <= 0) blinkAt.current = 2 + Math.random() * 4;
    if (eyes.current) eyes.current.scale.y = happy > 0.3 ? 0.3 : blinking ? 0.1 : 1;
    if (cheeks.current) cheeks.current.scale.setScalar(1 + happy * 0.35);
  });

  const handleTap = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    reaction.current = REACTION_SECONDS;
    onTap(e.nativeEvent.clientX, e.nativeEvent.clientY);
  };

  const skin = look.skin;
  const eyeY = 0.98;

  return (
    <group ref={group} position={[x, 0, 0]} rotation={[0, faceY, 0]}>
      {/* legs + shoes */}
      {[-0.1, 0.1].map((lx) => (
        <group key={lx} position={[lx, 0, 0]}>
          <Part position={[0, 0.16, 0]} color={look.dress ? skin : look.bottom} ramp={ramp}>
            <capsuleGeometry args={[0.065, 0.12, 6, 12]} />
          </Part>
          <Part position={[0, 0.04, 0.03]} scale={[1, 0.6, 1.4]} color="#f5f1ff" ramp={ramp}>
            <sphereGeometry args={[0.085, 16, 12]} />
          </Part>
        </group>
      ))}

      <group ref={body}>
        {/* torso */}
        {look.dress ? (
          <Part position={[0, 0.46, 0]} color={look.top} ramp={ramp}>
            <cylinderGeometry args={[0.15, 0.27, 0.34, 20]} />
          </Part>
        ) : (
          <>
            <Part position={[0, 0.46, 0]} color={look.top} ramp={ramp}>
              <capsuleGeometry args={[0.2, 0.18, 8, 16]} />
            </Part>
            <Part position={[0, 0.3, 0]} color={look.bottom} ramp={ramp}>
              <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
            </Part>
          </>
        )}

        {/* arms: pivot at the shoulder */}
        <group ref={armL} position={[0.25, 0.62, 0]}>
          <Part position={[0, -0.1, 0]} color={look.top} ramp={ramp}>
            <capsuleGeometry args={[0.055, 0.12, 6, 10]} />
          </Part>
          <Part position={[0, -0.24, 0]} color={skin} ramp={ramp}>
            <sphereGeometry args={[0.06, 12, 10]} />
          </Part>
        </group>
        <group ref={armR} position={[-0.25, 0.62, 0]}>
          <Part position={[0, -0.1, 0]} color={look.top} ramp={ramp}>
            <capsuleGeometry args={[0.055, 0.12, 6, 10]} />
          </Part>
          <Part position={[0, -0.24, 0]} color={skin} ramp={ramp}>
            <sphereGeometry args={[0.06, 12, 10]} />
          </Part>
        </group>

        {/* head */}
        <group ref={head} position={[0, 0, 0]}>
          <Part position={[0, 0.98, 0]} color={skin} ramp={ramp}>
            <sphereGeometry args={[0.4, 32, 24]} />
          </Part>

          {/* eyes */}
          <group ref={eyes} position={[0, eyeY, 0]}>
            {[-0.14, 0.14].map((ex) => (
              <group key={ex} position={[ex, 0, 0.36]}>
                <mesh scale={[1, 1.25, 0.6]}>
                  <sphereGeometry args={[0.055, 16, 12]} />
                  <meshBasicMaterial color="#1a1020" />
                </mesh>
                <mesh position={[0.018, 0.026, 0.03]}>
                  <sphereGeometry args={[0.016, 8, 8]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </group>
            ))}
          </group>

          {/* brows */}
          {[-0.14, 0.14].map((bx) => (
            <mesh key={bx} position={[bx, eyeY + 0.1, 0.35]} rotation={[0, 0, bx > 0 ? 0.12 : -0.12]}>
              <capsuleGeometry args={[0.012, 0.07, 4, 6]} />
              <meshBasicMaterial color={look.hair} />
            </mesh>
          ))}

          {/* cheeks */}
          <group ref={cheeks}>
            {[-0.24, 0.24].map((cx) => (
              <mesh key={cx} position={[cx, 0.9, 0.3]} scale={[1, 0.65, 0.4]}>
                <sphereGeometry args={[0.06, 12, 10]} />
                <meshBasicMaterial color="#ff8aa8" transparent opacity={0.65} />
              </mesh>
            ))}
          </group>

          {/* smile */}
          <mesh position={[0, 0.9, 0.38]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.055, 0.011, 8, 16, Math.PI]} />
            <meshBasicMaterial color="#5a2a2a" />
          </mesh>

          {/* hair */}
          <group position={[0, 0.98, 0]} rotation={[-0.42, 0, 0]}>
            <mesh>
              <sphereGeometry args={[0.425, 32, 20, 0, Math.PI * 2, 0, look.longHair ? 1.95 : 1.75]} />
              <meshToonMaterial color={look.hair} gradientMap={ramp} side={THREE.DoubleSide} />
            </mesh>
          </group>
          {look.longHair && (
            <>
              <mesh position={[0, 0.78, -0.22]} scale={[1, 1.35, 0.8]}>
                <sphereGeometry args={[0.38, 24, 18]} />
                <meshToonMaterial color={look.hair} gradientMap={ramp} />
              </mesh>
              <mesh position={[0, 1.42, -0.05]}>
                <sphereGeometry args={[0.13, 16, 12]} />
                <meshToonMaterial color={look.hair} gradientMap={ramp} />
              </mesh>
            </>
          )}

          {/* beard + moustache */}
          {look.beard && (
            <>
              <group position={[0, 0.98, 0]}>
                <mesh>
                  <sphereGeometry args={[0.408, 32, 14, Math.PI / 2 - 1.55, 3.1, 1.95, 0.75]} />
                  <meshToonMaterial color={look.hair} gradientMap={ramp} side={THREE.DoubleSide} />
                </mesh>
              </group>
              <mesh position={[0, 0.935, 0.375]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.8]}>
                <capsuleGeometry args={[0.02, 0.12, 4, 8]} />
                <meshToonMaterial color={look.hair} gradientMap={ramp} />
              </mesh>
            </>
          )}
        </group>
      </group>

      {/* Invisible hit capsule: simple and cheap to pick against. */}
      <mesh position={[0, 0.7, 0]} onPointerDown={handleTap} visible={false}>
        <capsuleGeometry args={[0.38, 0.9, 4, 8]} />
        <meshBasicMaterial />
      </mesh>

      {/* soft contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>
    </group>
  );
};

interface SceneProps {
  onTap: (who: 'him' | 'her', clientX: number, clientY: number) => void;
}

const MiniWorldScene: React.FC<SceneProps> = ({ onTap }) => (
  <Canvas
    dpr={[1, 1.5]}
    camera={{ position: [0, 1.0, 3.4], fov: 32 }}
    gl={{ antialias: true, powerPreference: 'low-power' }}
    onCreated={({ camera }) => camera.lookAt(0, 0.75, 0)}
  >
    <ambientLight intensity={1.2} />
    <directionalLight position={[2, 4, 3]} intensity={2} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
      <circleGeometry args={[1.5, 48]} />
      <meshToonMaterial color="#3a2457" />
    </mesh>
    <Mini look={HIM} x={-0.55} faceY={0.3} onTap={(cx, cy) => onTap('him', cx, cy)} />
    <Mini look={HER} x={0.55} faceY={-0.3} onTap={(cx, cy) => onTap('her', cx, cy)} />
  </Canvas>
);

export default MiniWorldScene;
