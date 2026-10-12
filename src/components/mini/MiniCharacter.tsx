import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Action, DURATION, GiftId, Look, MiniApi, Who, Zone } from './catalog';
import { GiftProp } from './MiniProps';
import { HEART_GEOMETRY, TOON_RAMP, Toon } from './shapes';

type Eyes = 'open' | 'happy' | 'heart' | 'wide' | 'sleepy';
type Mouth = 'smile' | 'grin' | 'o' | 'kiss';

interface Expr {
  eyes: Eyes;
  mouth: Mouth;
  blush: number;
}

const NEUTRAL: Expr = { eyes: 'open', mouth: 'smile', blush: 0.45 };

function exprFor(a: Action): Expr {
  switch (a.kind) {
    case 'pat':
      return { eyes: 'happy', mouth: 'smile', blush: 1 };
    case 'poke':
    case 'tickle':
    case 'dance':
      return { eyes: 'happy', mouth: 'grin', blush: 0.85 };
    case 'gift':
      return a.love ? { eyes: 'heart', mouth: 'grin', blush: 1 } : { eyes: 'happy', mouth: 'smile', blush: 0.8 };
    case 'feed':
      return { eyes: 'happy', mouth: 'o', blush: 1 };
    case 'sleep':
      return { eyes: 'sleepy', mouth: 'o', blush: 0.4 };
    case 'wake':
      return { eyes: 'wide', mouth: 'o', blush: 0.5 };
    case 'hug':
      return { eyes: 'happy', mouth: 'smile', blush: 1 };
    case 'kiss':
      return { eyes: 'happy', mouth: 'kiss', blush: 1 };
    case 'wave':
      return { eyes: 'open', mouth: 'grin', blush: 0.6 };
  }
}

function burstFor(a: Action): string[] {
  switch (a.kind) {
    case 'pat':
      return ['💖', '✨'];
    case 'poke':
      return ['✨'];
    case 'tickle':
      return ['😂', '✨', '😆'];
    case 'gift':
      return a.love ? ['💖', '💕', '💖', '✨', '💗', '💖'] : ['✨', '😊', '✨'];
    case 'feed':
      return ['🍼', '💕'];
    case 'wake':
      return ['❗'];
    case 'hug':
      return ['💞', '🤗'];
    case 'kiss':
      return ['💋', '💕'];
    case 'dance':
      return ['🎵'];
    default:
      return [];
  }
}

const PERIODIC: Partial<Record<Action['kind'], { every: number; emojis: string[] }>> = {
  sleep: { every: 1.3, emojis: ['💤'] },
  dance: { every: 0.7, emojis: ['🎵', '🎶'] },
  feed: { every: 1.0, emojis: ['💕'] },
};

// Head content is laid out relative to the neck pivot so tilts look natural.
const NECK_Y = 0.62;
const H = 0.36;

const ZONE_MATERIAL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

interface Props {
  who: Who;
  look: Look;
  baseX: number;
  register: (who: Who, api: MiniApi | null) => void;
  onTouch: (who: Who, zone: Zone) => void;
  onEmit: (emojis: string[], x: number, y: number) => void;
}

export const MiniCharacter: React.FC<Props> = ({ who, look, baseX, register, onTouch, onEmit }) => {
  const get = useThree((s) => s.get);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Group>(null);
  const talkMouth = useRef<THREE.Mesh>(null);

  const action = useRef<{ a: Action; t: number; dur: number; lastEmit: number } | null>(null);
  const talk = useRef(0);
  const clock = useRef(Math.random() * 10);
  const blinkAt = useRef(2 + Math.random() * 3);
  const idleFor = useRef(0);
  const nextIdleWave = useRef(15 + Math.random() * 15);

  const [expr, setExpr] = useState<Expr>(NEUTRAL);
  const exprRef = useRef(expr);
  exprRef.current = expr;
  const [prop, setProp] = useState<GiftId | null>(null);

  // +1 when the partner is to our right (+x).
  const side = baseX < 0 ? 1 : -1;

  const emitAtHead = (emojis: string[]) => {
    if (!head.current || emojis.length === 0) return;
    const { camera, size } = get();
    const v = new THREE.Vector3(0, H + 0.45, 0);
    head.current.localToWorld(v);
    v.project(camera);
    onEmit(emojis, ((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height);
  };

  const start = (a: Action) => {
    action.current = { a, t: 0, dur: DURATION[a.kind], lastEmit: 0 };
    idleFor.current = 0;
    setExpr(exprFor(a));
    setProp(a.gift ?? (a.kind === 'sleep' ? 'blanket' : a.kind === 'feed' ? 'bottle' : null));
    emitAtHead(burstFor(a));
  };

  useEffect(() => {
    register(who, {
      play: start,
      setTalk: (level) => {
        talk.current = level;
      },
      current: () => action.current?.a.kind ?? null,
    });
    return () => register(who, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  useFrame((_, rawDelta) => {
    const d = Math.min(rawDelta, 0.05);
    clock.current += d;
    const t = clock.current;
    const breathe = Math.sin(t * 1.8);

    let hop = 0;
    let dx = 0;
    let turn = 0;
    let squash = 1 + breathe * 0.015;
    let headX = 0;
    let headY = Math.sin(t * 0.4) * 0.15;
    let headZ = Math.sin(t * 0.9) * 0.04;
    let aLx = 0;
    let aRx = 0;
    let aLz = 0.2 + breathe * 0.03;
    let aRz = -aLz;

    const cur = action.current;
    if (cur) {
      cur.t += d;
      const s = cur.t;
      const p = Math.min(1, s / cur.dur);
      // 0 to 1 to 0 envelope with quick ease in/out.
      const env = Math.max(0, Math.min(1, p / 0.15, (1 - p) / 0.15));
      const holdArms = () => {
        aLx = aRx = -1.1 * env;
        aLz = 0.2 - 0.55 * env;
        aRz = -aLz;
      };

      switch (cur.a.kind) {
        case 'pat':
          headZ = Math.sin(s * 6) * 0.12 * env;
          headX = 0.12 * env;
          squash = 1 - 0.08 * Math.max(0, 1 - s * 4);
          break;
        case 'poke':
          squash = 1 - 0.18 * Math.exp(-s * 5) * Math.cos(s * 25);
          headZ = Math.sin(s * 25) * 0.05 * Math.exp(-s * 4);
          break;
        case 'tickle':
          hop = Math.abs(Math.sin(s * 9)) * 0.08 * env;
          headZ = Math.sin(s * 20) * 0.1 * env;
          aLz = 0.2 + env * (1 + Math.sin(s * 18) * 0.25);
          aRz = -(0.2 + env * (1 + Math.cos(s * 18) * 0.25));
          break;
        case 'gift':
          holdArms();
          if (cur.a.love) {
            hop = Math.abs(Math.sin(s * 7)) * 0.1 * env;
            if (p > 0.35 && p < 0.65) turn = ((p - 0.35) / 0.3) * Math.PI * 2;
          } else if (p < 0.4) {
            hop = Math.abs(Math.sin(s * 6)) * 0.05;
          }
          break;
        case 'feed':
          headX = -0.1 * env;
          headZ = Math.sin(s * 1.5) * 0.06;
          squash = 1 + Math.sin(s * 9) * 0.012;
          aLx = aRx = -1.7 * env;
          aLz = 0.2 - 0.5 * env;
          aRz = -aLz;
          break;
        case 'sleep':
          headZ = 0.28 * env * side;
          headX = 0.15 * env;
          headY = 0;
          squash = 1 + Math.sin(s * 1.3) * 0.03;
          aLx = aRx = -0.7 * env;
          break;
        case 'wake':
          hop = Math.sin(Math.min(1, p * 1.6) * Math.PI) * 0.2;
          aLz = 0.2 + 1.3 * env;
          aRz = -aLz;
          break;
        case 'hug':
          dx = side * 0.15 * env;
          turn = side * 0.6 * env;
          headZ = -side * 0.12 * env;
          aLx = aRx = -1.3 * env;
          aLz = 0.2 - 0.5 * env;
          aRz = -aLz;
          squash = 1 + Math.sin(s * 3) * 0.02 * env;
          break;
        case 'kiss':
          dx = side * 0.16 * env;
          turn = side * 1.15 * env;
          headX = 0.1 * env;
          aLx = aRx = 0.35 * env;
          hop = p > 0.45 && p < 0.6 ? 0.03 : 0;
          break;
        case 'dance': {
          const beat = Math.sin(s * 2 * Math.PI);
          hop = Math.abs(beat) * 0.08 * env;
          turn = Math.sin(s * Math.PI) * 0.5 * env;
          headZ = Math.sin(s * Math.PI) * 0.12 * env;
          aLz = 0.2 + env * (1.5 + beat * 0.9);
          aRz = -(0.2 + env * (1.5 - beat * 0.9));
          break;
        }
        case 'wave':
          headZ = -0.1 * env * side;
          aRz = -0.2 - 2.3 * env + Math.sin(s * 14) * 0.3 * env;
          break;
      }

      const periodic = PERIODIC[cur.a.kind];
      if (periodic && s - cur.lastEmit > periodic.every) {
        cur.lastEmit = s;
        emitAtHead([periodic.emojis[Math.floor(Math.random() * periodic.emojis.length)]]);
      }

      if (p >= 1) {
        action.current = null;
        setExpr(NEUTRAL);
        setProp(null);
      }
    } else {
      // Left alone for a while, they wave to get your attention.
      idleFor.current += d;
      if (idleFor.current > nextIdleWave.current) {
        nextIdleWave.current = 15 + Math.random() * 20;
        start({ kind: 'wave' });
      }
    }

    // Lip-sync while repeating your voice.
    const level = talk.current;
    const talking = level > 0.03;
    if (talking) headX += level * 0.08;
    if (mouth.current) mouth.current.visible = !talking;
    if (talkMouth.current) {
      talkMouth.current.visible = talking;
      talkMouth.current.scale.set(1, 0.3 + level * 1.4, 1);
    }

    blinkAt.current -= d;
    if (blinkAt.current <= 0) blinkAt.current = 2 + Math.random() * 4;
    const blinking = blinkAt.current < 0.12 && exprRef.current.eyes === 'open';
    if (eyes.current) eyes.current.scale.y = blinking ? 0.1 : 1;

    if (root.current) {
      root.current.position.set(baseX + dx, hop, 0);
      root.current.rotation.y = side * 0.3 + turn;
    }
    if (body.current) {
      const bulge = 1 + (1 - squash) * 0.5;
      body.current.scale.set(bulge, squash, bulge);
    }
    head.current?.rotation.set(headX, headY, headZ);
    armL.current?.rotation.set(aLx, 0, aLz);
    armR.current?.rotation.set(aRx, 0, aRz);
  });

  const touch = (zone: Zone) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onTouch(who, zone);
  };

  const skin = look.skin;
  const eyeSpots = [-0.14, 0.14];

  return (
    <group ref={root} position={[baseX, 0, 0]}>
      {/* soft contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>

      <group ref={body}>
        {/* legs + shoes */}
        {[-0.1, 0.1].map((lx) => (
          <group key={lx} position={[lx, 0, 0]}>
            <Toon position={[0, 0.16, 0]} color={look.dress ? skin : look.bottom}>
              <capsuleGeometry args={[0.065, 0.12, 6, 12]} />
            </Toon>
            <Toon position={[0, 0.04, 0.03]} scale={[1, 0.6, 1.4]} color="#f5f1ff">
              <sphereGeometry args={[0.085, 16, 12]} />
            </Toon>
          </group>
        ))}

        {/* torso */}
        {look.dress ? (
          <Toon position={[0, 0.46, 0]} color={look.top}>
            <cylinderGeometry args={[0.15, 0.27, 0.34, 20]} />
          </Toon>
        ) : (
          <>
            <Toon position={[0, 0.46, 0]} color={look.top}>
              <capsuleGeometry args={[0.2, 0.18, 8, 16]} />
            </Toon>
            <Toon position={[0, 0.3, 0]} color={look.bottom}>
              <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
            </Toon>
          </>
        )}

        {/* arms, pivoting at the shoulder */}
        {[
          { ref: armL, x: 0.25 },
          { ref: armR, x: -0.25 },
        ].map(({ ref, x }) => (
          <group key={x} ref={ref} position={[x, NECK_Y, 0]}>
            <Toon position={[0, -0.1, 0]} color={look.top}>
              <capsuleGeometry args={[0.055, 0.12, 6, 10]} />
            </Toon>
            <Toon position={[0, -0.24, 0]} color={skin}>
              <sphereGeometry args={[0.06, 12, 10]} />
            </Toon>
          </group>
        ))}

        {prop && prop !== 'bottle' && prop !== 'blanket' && (
          <group position={[0, 0.5, 0.36]}>
            <GiftProp id={prop} />
          </group>
        )}
        {prop === 'blanket' && (
          <group position={[0, 0.36, 0.26]}>
            <GiftProp id="blanket" />
          </group>
        )}

        <mesh position={[0, 0.42, 0]} onPointerDown={touch('body')} material={ZONE_MATERIAL}>
          <capsuleGeometry args={[0.27, 0.2, 4, 8]} />
        </mesh>
        <mesh position={[0, 0.09, 0.02]} onPointerDown={touch('feet')} material={ZONE_MATERIAL}>
          <boxGeometry args={[0.46, 0.2, 0.32]} />
        </mesh>

        {/* head, pivoting at the neck */}
        <group ref={head} position={[0, NECK_Y, 0]}>
          <Toon position={[0, H, 0]} color={skin}>
            <sphereGeometry args={[0.4, 32, 24]} />
          </Toon>

          <group ref={eyes} position={[0, H, 0]}>
            {eyeSpots.map((ex) => (
              <group key={ex} position={[ex, 0, 0.36]}>
                {expr.eyes === 'open' || expr.eyes === 'wide' ? (
                  <>
                    <mesh scale={expr.eyes === 'wide' ? [1.25, 1.5, 0.6] : [1, 1.25, 0.6]}>
                      <sphereGeometry args={[0.055, 16, 12]} />
                      <meshBasicMaterial color="#1a1020" />
                    </mesh>
                    <mesh position={[0.018, 0.026, 0.03]}>
                      <sphereGeometry args={[0.016, 8, 8]} />
                      <meshBasicMaterial color="#ffffff" />
                    </mesh>
                  </>
                ) : expr.eyes === 'happy' ? (
                  <mesh position={[0, -0.015, 0.01]}>
                    <torusGeometry args={[0.045, 0.012, 6, 14, Math.PI]} />
                    <meshBasicMaterial color="#1a1020" />
                  </mesh>
                ) : expr.eyes === 'heart' ? (
                  <mesh geometry={HEART_GEOMETRY} position={[0, 0, 0.02]} scale={1.15}>
                    <meshBasicMaterial color="#ff3b6b" />
                  </mesh>
                ) : (
                  <mesh position={[0, -0.015, 0.01]} rotation={[0, 0, Math.PI / 2]}>
                    <capsuleGeometry args={[0.011, 0.07, 4, 6]} />
                    <meshBasicMaterial color="#1a1020" />
                  </mesh>
                )}
              </group>
            ))}
          </group>

          {/* brows */}
          {eyeSpots.map((bx) => (
            <mesh
              key={bx}
              position={[bx, H + (expr.eyes === 'wide' ? 0.13 : 0.1), 0.35]}
              rotation={[0, 0, Math.PI / 2 + (bx > 0 ? 0.12 : -0.12)]}
            >
              <capsuleGeometry args={[0.012, 0.07, 4, 6]} />
              <meshBasicMaterial color={look.hair} />
            </mesh>
          ))}

          {/* cheeks */}
          {[-0.24, 0.24].map((cx) => (
            <mesh key={cx} position={[cx, H - 0.08, 0.3]} scale={[1, 0.65, 0.4]}>
              <sphereGeometry args={[0.06 + expr.blush * 0.015, 12, 10]} />
              <meshBasicMaterial color="#ff8aa8" transparent opacity={0.25 + expr.blush * 0.55} />
            </mesh>
          ))}

          {/* mouth */}
          <group ref={mouth} position={[0, H - 0.08, 0]}>
            {expr.mouth === 'smile' && (
              <mesh position={[0, 0, 0.385]} rotation={[0, 0, Math.PI]}>
                <torusGeometry args={[0.05, 0.011, 8, 16, Math.PI]} />
                <meshBasicMaterial color="#5a2a2a" />
              </mesh>
            )}
            {expr.mouth === 'grin' && (
              <group position={[0, 0.01, 0.392]}>
                <mesh>
                  <circleGeometry args={[0.065, 18, Math.PI, Math.PI]} />
                  <meshBasicMaterial color="#5a1f2b" />
                </mesh>
                <mesh position={[0, -0.035, 0.002]}>
                  <circleGeometry args={[0.03, 12, Math.PI, Math.PI]} />
                  <meshBasicMaterial color="#ff7a95" />
                </mesh>
              </group>
            )}
            {expr.mouth === 'o' && (
              <mesh position={[0, -0.01, 0.392]} scale={[1, 1.3, 1]}>
                <circleGeometry args={[0.026, 14]} />
                <meshBasicMaterial color="#5a1f2b" />
              </mesh>
            )}
            {expr.mouth === 'kiss' && (
              <mesh position={[0, -0.01, 0.39]}>
                <torusGeometry args={[0.022, 0.012, 8, 16]} />
                <meshBasicMaterial color="#e0436b" />
              </mesh>
            )}
          </group>
          <mesh ref={talkMouth} position={[0, H - 0.09, 0.392]} visible={false}>
            <circleGeometry args={[0.045, 16]} />
            <meshBasicMaterial color="#5a1f2b" />
          </mesh>

          {/* hair cap, tilted back so the hairline sits above the brows */}
          <mesh position={[0, H, 0]} rotation={[-0.42, 0, 0]}>
            <sphereGeometry args={[0.425, 32, 20, 0, Math.PI * 2, 0, look.longHair ? 1.95 : 1.75]} />
            <meshToonMaterial color={look.hair} gradientMap={TOON_RAMP} side={THREE.DoubleSide} />
          </mesh>
          {look.longHair && (
            <>
              <mesh position={[0, H - 0.2, -0.22]} scale={[1, 1.35, 0.8]}>
                <sphereGeometry args={[0.38, 24, 18]} />
                <meshToonMaterial color={look.hair} gradientMap={TOON_RAMP} />
              </mesh>
              <mesh position={[0, H + 0.44, -0.05]}>
                <sphereGeometry args={[0.13, 16, 12]} />
                <meshToonMaterial color={look.hair} gradientMap={TOON_RAMP} />
              </mesh>
              <mesh position={[0.2, H + 0.32, 0.22]} rotation={[0, 0, -0.5]}>
                <torusGeometry args={[0.05, 0.022, 8, 16]} />
                <meshToonMaterial color="#ff5c8a" gradientMap={TOON_RAMP} />
              </mesh>
            </>
          )}

          {look.beard && (
            <>
              <mesh position={[0, H, 0]}>
                <sphereGeometry args={[0.408, 32, 14, Math.PI / 2 - 1.55, 3.1, 1.95, 0.75]} />
                <meshToonMaterial color={look.hair} gradientMap={TOON_RAMP} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, H - 0.045, 0.375]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.8]}>
                <capsuleGeometry args={[0.02, 0.12, 4, 8]} />
                <meshToonMaterial color={look.hair} gradientMap={TOON_RAMP} />
              </mesh>
            </>
          )}

          {prop === 'bottle' && (
            <group position={[0, H - 0.1, 0.52]} rotation={[-1.3, 0, 0]}>
              <GiftProp id="bottle" />
            </group>
          )}

          <mesh position={[0, H, 0]} onPointerDown={touch('head')} material={ZONE_MATERIAL}>
            <sphereGeometry args={[0.44, 12, 10]} />
          </mesh>
        </group>
      </group>
    </group>
  );
};
