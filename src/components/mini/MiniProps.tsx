import React from 'react';
import { GiftId } from './catalog';
import { HEART_GEOMETRY, Toon } from './shapes';

/** Little 3D props the minis hold. Each is roughly 0.2 units across. */
export const GiftProp: React.FC<{ id: GiftId }> = ({ id }) => {
  switch (id) {
    case 'chocolate':
      return (
        <group rotation={[0.2, 0, 0]}>
          <Toon color="#5b3426">
            <boxGeometry args={[0.22, 0.15, 0.06]} />
          </Toon>
          <Toon color="#f5c542" outline={false}>
            <boxGeometry args={[0.03, 0.155, 0.065]} />
          </Toon>
          <Toon color="#f5c542" outline={false}>
            <boxGeometry args={[0.225, 0.03, 0.065]} />
          </Toon>
          <mesh geometry={HEART_GEOMETRY} position={[0, 0.1, 0.03]} scale={0.6}>
            <meshToonMaterial color="#ff3b6b" />
          </mesh>
        </group>
      );
    case 'ring':
      return (
        <group position={[0, 0.03, 0]}>
          <Toon color="#f5c542">
            <torusGeometry args={[0.06, 0.016, 10, 24]} />
          </Toon>
          <Toon position={[0, 0.085, 0]} color="#8be9fd" scale={[1, 1.2, 1]}>
            <octahedronGeometry args={[0.035]} />
          </Toon>
        </group>
      );
    case 'flowers':
      return (
        <group position={[0, 0.02, 0]}>
          <Toon position={[0, -0.04, 0]} color="#fde2f3">
            <coneGeometry args={[0.09, 0.18, 12, 1, true]} />
          </Toon>
          {[
            [-0.05, 0.08, 0, '#ff4d6d'],
            [0.05, 0.09, 0, '#ffb3c6'],
            [0, 0.12, -0.02, '#ffd166'],
            [0, 0.07, 0.04, '#c77dff'],
          ].map(([x, y, z, c]) => (
            <Toon key={c as string} position={[x as number, y as number, z as number]} color={c as string}>
              <sphereGeometry args={[0.04, 10, 8]} />
            </Toon>
          ))}
        </group>
      );
    case 'teddy':
      return (
        <group>
          <Toon color="#c68b59">
            <sphereGeometry args={[0.08, 14, 12]} />
          </Toon>
          <Toon position={[0, 0.11, 0]} color="#c68b59">
            <sphereGeometry args={[0.065, 14, 12]} />
          </Toon>
          {[-0.05, 0.05].map((x) => (
            <Toon key={x} position={[x, 0.165, 0]} color="#a86f43">
              <sphereGeometry args={[0.025, 8, 8]} />
            </Toon>
          ))}
          <Toon position={[0, 0.095, 0.055]} color="#f1d3b3" outline={false}>
            <sphereGeometry args={[0.025, 8, 8]} />
          </Toon>
        </group>
      );
    case 'icecream':
      return (
        <group position={[0, -0.02, 0]}>
          <Toon position={[0, -0.03, 0]} rotation={[Math.PI, 0, 0]} color="#e0a96d">
            <coneGeometry args={[0.055, 0.15, 12]} />
          </Toon>
          <Toon position={[0, 0.07, 0]} color="#ffafcc">
            <sphereGeometry args={[0.065, 14, 12]} />
          </Toon>
          <Toon position={[0, 0.14, 0]} color="#e63946">
            <sphereGeometry args={[0.02, 8, 8]} />
          </Toon>
        </group>
      );
    case 'lego':
      return (
        <group rotation={[0.3, 0.4, 0]}>
          <Toon color="#e63946">
            <boxGeometry args={[0.2, 0.09, 0.1]} />
          </Toon>
          {[-0.075, -0.025, 0.025, 0.075].flatMap((x) =>
            [-0.025, 0.025].map((z) => (
              <Toon key={`${x}${z}`} position={[x, 0.055, z]} color="#e63946" outline={false}>
                <cylinderGeometry args={[0.016, 0.016, 0.02, 10]} />
              </Toon>
            )),
          )}
        </group>
      );
    case 'bottle':
      return (
        <group>
          <Toon color="#f8f9ff">
            <cylinderGeometry args={[0.04, 0.04, 0.14, 14]} />
          </Toon>
          <Toon position={[0, -0.02, 0]} color="#bde0fe" outline={false}>
            <cylinderGeometry args={[0.041, 0.041, 0.08, 14]} />
          </Toon>
          <Toon position={[0, 0.08, 0]} color="#7aa7ff">
            <cylinderGeometry args={[0.043, 0.043, 0.025, 14]} />
          </Toon>
          <Toon position={[0, 0.11, 0]} color="#f2c9a0">
            <sphereGeometry args={[0.022, 10, 8]} />
          </Toon>
        </group>
      );
    case 'pizza':
      return (
        <group rotation={[1.2, 0, Math.PI / 2]}>
          <Toon color="#f4c95d">
            <cylinderGeometry args={[0.17, 0.17, 0.02, 12, 1, false, 0, 0.75]} />
          </Toon>
          {[
            [0.08, 0.04],
            [0.12, 0.02],
          ].map(([r, a]) => (
            <Toon
              key={r}
              position={[Math.sin(a + 0.3) * r, 0.015, Math.cos(a + 0.3) * r]}
              color="#c1121f"
              outline={false}
            >
              <cylinderGeometry args={[0.02, 0.02, 0.01, 10]} />
            </Toon>
          ))}
        </group>
      );
    case 'controller':
      return (
        <group rotation={[0.4, 0, 0]}>
          <Toon color="#2b2d42">
            <boxGeometry args={[0.18, 0.06, 0.08]} />
          </Toon>
          {[-0.09, 0.09].map((x) => (
            <Toon key={x} position={[x, -0.01, 0.01]} color="#2b2d42">
              <sphereGeometry args={[0.045, 12, 10]} />
            </Toon>
          ))}
          {[
            [0.05, '#ef476f'],
            [0.075, '#06d6a0'],
          ].map(([x, c]) => (
            <Toon key={c as string} position={[x as number, 0.035, 0.01]} color={c as string} outline={false}>
              <sphereGeometry args={[0.012, 8, 8]} />
            </Toon>
          ))}
        </group>
      );
    case 'blanket':
      return (
        <group rotation={[-0.15, 0, 0]}>
          <Toon color="#a5c8ff">
            <boxGeometry args={[0.62, 0.48, 0.05]} />
          </Toon>
          {[-0.12, 0.04].map((y) => (
            <Toon key={y} position={[0, y, 0.027]} color="#e0ecff" outline={false}>
              <boxGeometry args={[0.62, 0.04, 0.005]} />
            </Toon>
          ))}
        </group>
      );
  }
};
