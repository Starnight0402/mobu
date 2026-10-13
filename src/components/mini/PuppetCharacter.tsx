import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Action, DURATION, GiftId, MiniApi, Who, Zone } from './catalog';
import { PERIODIC, burstFor } from './MiniCharacter';
import { GiftTexture, PROP_HEIGHT, loadGiftTexture } from './giftArt';
import { GiftProp } from './MiniProps';

/**
 * A character drawn from flat PNGs. The picture sits on a finely subdivided
 * plane whose vertices a small shader bends (breathing, sway, jelly squish),
 * and expressions are swaps between PNG variants.
 */

export const PUPPET_HEIGHT = 1.6;
const ASPECT = 404 / 1023;
const WIDTH = PUPPET_HEIGHT * ASPECT;

type Expr = 'neutral' | 'happy' | 'laugh' | 'love' | 'kiss' | 'sleep' | 'sad' | 'speaking' | 'surprised';
const FILES = ['neutral', 'happy', 'laugh', 'love', 'kiss', 'sleep', 'sad', 'speaking', 'surprised'] as const;

// If a variant wasn't generated, fall back down this list.
const FALLBACK: Record<Expr, Expr[]> = {
  neutral: ['neutral'],
  happy: ['happy', 'laugh', 'neutral'],
  laugh: ['laugh', 'happy', 'neutral'],
  love: ['love', 'happy', 'laugh', 'neutral'],
  kiss: ['kiss', 'happy', 'neutral'],
  sleep: ['sleep', 'neutral'],
  sad: ['sad', 'neutral'],
  speaking: ['speaking', 'laugh', 'neutral'],
  surprised: ['surprised', 'speaking', 'laugh', 'neutral'],
};

function exprFor(a: Action): Expr {
  switch (a.kind) {
    case 'pat':
    case 'feed':
    case 'hug':
    case 'wave':
      return 'happy';
    case 'poke':
    case 'wake':
      return 'surprised';
    case 'tickle':
    case 'dance':
      return 'laugh';
    case 'gift':
      return a.love ? 'love' : 'happy';
    case 'kiss':
      return 'kiss';
    case 'sleep':
      return 'sleep';
    case 'cry':
      return 'sad';
  }
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uSquashY;
  uniform float uSquashX;
  uniform float uBend;
  uniform float uWobble;
  uniform float uWobbleSpeed;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float h = uv.y;
    p.x *= uSquashX;
    p.y *= uSquashY * (1.0 + sin(uTime * 1.8) * 0.012 * h);
    p.x += uBend * h * h * uHeight;
    p.x += sin(h * 9.0 - uTime * uWobbleSpeed) * uWobble * h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uTexA;
  uniform sampler2D uTexB;
  uniform float uMix;
  varying vec2 vUv;
  void main() {
    vec4 a = texture2D(uTexA, vUv);
    vec4 b = texture2D(uTexB, vUv);
    vec4 c = mix(a, b, uMix);
    if (c.a < 0.02) discard;
    gl_FragColor = c;
    #include <colorspace_fragment>
  }
`;

// Seconds of being ignored before they start to sulk.
const SAD_AFTER = 55;

// Where the eyes sit on the art, as a fraction of its height / width.
const EYE_Y = PUPPET_HEIGHT * 0.793;
const EYE_X = WIDTH * 0.12;

const TEAR_MATERIAL = new THREE.MeshBasicMaterial({ color: '#8fd3ff', transparent: true, opacity: 0.85 });

const HeldProp: React.FC<{ id: GiftId }> = ({ id }) => {
  const [art, setArt] = useState<GiftTexture | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setArt(undefined);
    void loadGiftTexture(id).then((a) => {
      if (!cancelled) setArt(a);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  if (art === undefined) return null;

  const position: [number, number, number] =
    id === 'bottle' ? [0.2, 1.1, 0.14] : id === 'blanket' ? [0, 0.55, 0.14] : [0, 0.78, 0.14];
  const rotation: [number, number, number] = id === 'bottle' ? [0, 0, 1.3] : [0, 0, 0];

  if (art) {
    const h = PROP_HEIGHT[id];
    return (
      <group position={position} rotation={rotation}>
        <mesh renderOrder={3}>
          <planeGeometry args={[h * art.aspect, h]} />
          <meshBasicMaterial map={art.texture} transparent depthWrite={false} />
        </mesh>
      </group>
    );
  }
  const scale = id === 'bottle' ? 1.35 : id === 'blanket' ? 1.3 : 1.25;
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <GiftProp id={id} />
    </group>
  );
};

const ZONE_MATERIAL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

interface Props {
  who: Who;
  baseX: number;
  register: (who: Who, api: MiniApi | null) => void;
  onTouch: (who: Who, zone: Zone) => void;
  onEmit: (emojis: string[], x: number, y: number) => void;
  /** Called when the neutral image can't be loaded, so the caller can fall back. */
  onUnavailable: (who: Who) => void;
}

export const PuppetCharacter: React.FC<Props> = ({ who, baseX, register, onTouch, onEmit, onUnavailable }) => {
  const get = useThree((s) => s.get);
  const root = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);

  const [textures, setTextures] = useState<Partial<Record<Expr, THREE.Texture>> | null>(null);
  const [prop, setProp] = useState<GiftId | null>(null);

  const action = useRef<{ a: Action; t: number; dur: number; lastEmit: number } | null>(null);
  const talk = useRef(0);
  const clock = useRef(Math.random() * 10);
  const blinkAt = useRef(2 + Math.random() * 3);
  const idleFor = useRef(0);
  const nextIdleWave = useRef(15 + Math.random() * 15);
  const tears = useRef<THREE.Group>(null);
  const shown = useRef<Expr | null>(null);
  const fade = useRef(1);

  const side = baseX < 0 ? 1 : -1;

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    const loaded: Partial<Record<Expr, THREE.Texture>> = {};
    let pending = FILES.length;
    const done = () => {
      if (--pending > 0 || cancelled) return;
      if (!loaded.neutral) onUnavailable(who);
      else setTextures(loaded);
    };
    for (const name of FILES) {
      loader.load(
        `${import.meta.env.BASE_URL}mini/${who}/${name}.png`,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          loaded[name] = tex;
          done();
        },
        undefined,
        done,
      );
    }
    return () => {
      cancelled = true;
      Object.values(loaded).forEach((t) => t?.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  const resolve = (want: Expr): THREE.Texture | undefined => {
    if (!textures) return undefined;
    for (const e of FALLBACK[want]) if (textures[e]) return textures[e];
    return textures.neutral;
  };

  const emitAtHead = (emojis: string[]) => {
    if (!root.current || emojis.length === 0) return;
    const { camera, size } = get();
    const v = new THREE.Vector3(0, PUPPET_HEIGHT + 0.08, 0.1);
    root.current.localToWorld(v);
    v.project(camera);
    onEmit(emojis, ((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height);
  };

  const start = (a: Action) => {
    action.current = { a, t: 0, dur: DURATION[a.kind], lastEmit: 0 };
    idleFor.current = 0;
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
      sad: () => action.current?.a.kind === 'cry' || (!action.current && idleFor.current >= SAD_AFTER),
    });
    return () => register(who, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  // Built imperatively: handing a uniforms object to <shaderMaterial> makes R3F
  // copy it, so per-frame writes to our object would never reach the shader.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
        uTime: { value: 0 },
        uHeight: { value: PUPPET_HEIGHT },
        uSquashY: { value: 1 },
        uSquashX: { value: 1 },
        uBend: { value: 0 },
        uWobble: { value: 0 },
        uWobbleSpeed: { value: 14 },
        uTexA: { value: null },
        uTexB: { value: null },
        uMix: { value: 1 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const uniforms = material.uniforms;

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(WIDTH, PUPPET_HEIGHT, 10, 24);
    g.translate(0, PUPPET_HEIGHT / 2, 0);
    return g;
  }, []);

  useFrame((_, rawDelta) => {
    if (!textures) return;
    const d = Math.min(rawDelta, 0.05);
    clock.current += d;
    const t = clock.current;

    let hop = 0;
    let dx = 0;
    let turn = side * 0.12;
    let squashY = 1;
    let squashX = 1;
    let bend = Math.sin(t * 0.9) * 0.012;
    let wobble = 0;
    let wobbleSpeed = 14;
    let rollZ = 0;
    let want: Expr = 'neutral';

    const cur = action.current;
    if (cur) {
      cur.t += d;
      const s = cur.t;
      const p = Math.min(1, s / cur.dur);
      const env = Math.max(0, Math.min(1, p / 0.15, (1 - p) / 0.15));
      want = exprFor(cur.a);

      switch (cur.a.kind) {
        case 'pat':
          bend = Math.sin(s * 6) * 0.05 * env;
          squashY = 1 - 0.06 * Math.max(0, 1 - s * 4);
          break;
        case 'poke': {
          const k = Math.exp(-s * 4.5);
          squashY = 1 - 0.2 * k * Math.cos(s * 22);
          squashX = 1 + 0.16 * k * Math.cos(s * 22);
          wobble = 0.05 * k;
          break;
        }
        case 'tickle':
          hop = Math.abs(Math.sin(s * 9)) * 0.09 * env;
          rollZ = Math.sin(s * 18) * 0.07 * env;
          wobble = 0.05 * env;
          wobbleSpeed = 24;
          break;
        case 'gift':
          if (cur.a.love) {
            hop = Math.abs(Math.sin(s * 7)) * 0.12 * env;
            squashY = 1 - 0.05 * Math.abs(Math.cos(s * 7)) * env;
            if (p > 0.35 && p < 0.65) turn += ((p - 0.35) / 0.3) * Math.PI * 2;
          } else if (p < 0.4) {
            hop = Math.abs(Math.sin(s * 6)) * 0.05;
          }
          break;
        case 'feed':
          bend = -0.03 * env;
          squashY = 1 + Math.sin(s * 9) * 0.008;
          rollZ = Math.sin(s * 1.5) * 0.02;
          break;
        case 'sleep':
          rollZ = 0.1 * env * side;
          bend = 0.08 * env * side;
          squashY = 1 + Math.sin(s * 1.3) * 0.02;
          break;
        case 'wake':
          hop = Math.sin(Math.min(1, p * 1.6) * Math.PI) * 0.22;
          squashY = 1 + 0.05 * env;
          break;
        case 'hug':
          dx = side * 0.2 * env;
          bend = side * 0.1 * env;
          rollZ = -side * 0.04 * env;
          squashX = 1 + Math.sin(s * 3) * 0.015 * env;
          break;
        case 'kiss':
          dx = side * 0.22 * env;
          bend = side * 0.16 * env;
          rollZ = -side * 0.05 * env;
          hop = p > 0.45 && p < 0.6 ? 0.03 : 0;
          break;
        case 'dance': {
          const beat = Math.sin(s * 2 * Math.PI);
          hop = Math.abs(beat) * 0.1 * env;
          squashY = 1 - 0.05 * Math.abs(Math.cos(s * Math.PI * 2)) * env;
          rollZ = Math.sin(s * Math.PI) * 0.1 * env;
          bend = Math.sin(s * Math.PI) * 0.06 * env;
          break;
        }
        case 'cry':
          squashY = 0.985 + Math.sin(s * 13) * 0.012 * env;
          bend = -0.03 * env + Math.sin(s * 13) * 0.01 * env;
          rollZ = Math.sin(s * 2) * 0.015;
          break;
        case 'wave':
          bend = -0.04 * env * side;
          rollZ = Math.sin(s * 5) * 0.03 * env;
          break;
      }

      const periodic = PERIODIC[cur.a.kind];
      if (periodic && s - cur.lastEmit > periodic.every) {
        cur.lastEmit = s;
        emitAtHead([periodic.emojis[Math.floor(Math.random() * periodic.emojis.length)]]);
      }
      if (p >= 1) {
        // After a good cry they stay glum until someone cheers them up.
        if (cur.a.kind === 'cry') idleFor.current = SAD_AFTER;
        action.current = null;
        setProp(null);
      }
    } else {
      idleFor.current += d;
      // Left alone: first a wave for attention, then a sulk if still ignored.
      if (idleFor.current > nextIdleWave.current && idleFor.current < SAD_AFTER) {
        nextIdleWave.current = idleFor.current + 15 + Math.random() * 20;
        start({ kind: 'wave' });
      } else if (idleFor.current >= SAD_AFTER) {
        want = 'sad';
        squashY = 1 - 0.02;
        bend = -0.02;
      }
    }

    // Tears run while sad: slow when merely glum, streaming when crying.
    if (tears.current) {
      tears.current.visible = want === 'sad';
      if (tears.current.visible) {
        const rate = cur?.a.kind === 'cry' ? 1.1 : 0.45;
        tears.current.children.forEach((drop, i) => {
          const phase = (t * rate + (i % 3) / 3 + (i < 3 ? 0 : 0.17)) % 1;
          drop.position.y = -phase * 0.34;
          drop.scale.setScalar(Math.sin(Math.PI * Math.min(1, phase * 1.15)) + 0.001);
        });
        tears.current.position.x = bend * 0.63 * PUPPET_HEIGHT;
      }
    }

    // Voice repeat: open the mouth with the loudness.
    if (talk.current > 0.2) want = 'speaking';

    // Blink by flashing the eyes-closed frame during plain idle.
    blinkAt.current -= d;
    if (blinkAt.current <= 0) blinkAt.current = 2 + Math.random() * 4;
    if (want === 'neutral' && blinkAt.current < 0.12 && textures.sleep) want = 'sleep';

    // Crossfade to the wanted picture.
    const target = resolve(want);
    if (target && shown.current !== want) {
      {
        const next = target;
        if (uniforms.uTexA.value === null) {
          uniforms.uTexA.value = next;
          uniforms.uTexB.value = next;
          uniforms.uMix.value = 1;
        } else {
          uniforms.uTexA.value = uniforms.uTexB.value;
          uniforms.uTexB.value = next;
          uniforms.uMix.value = 0;
          fade.current = 0;
        }
      }
      shown.current = want;
    }
    if (fade.current < 1) {
      fade.current = Math.min(1, fade.current + d / 0.09);
      uniforms.uMix.value = fade.current;
    }

    uniforms.uTime.value = t;
    uniforms.uSquashY.value = squashY;
    uniforms.uSquashX.value = squashX;
    uniforms.uBend.value = bend;
    uniforms.uWobble.value = wobble;
    uniforms.uWobbleSpeed.value = wobbleSpeed;

    if (root.current) {
      root.current.position.set(baseX + dx, hop, 0);
      root.current.rotation.y = turn;
    }
    if (tilt.current) tilt.current.rotation.z = rollZ;
  });

  const touch = (zone: Zone) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onTouch(who, zone);
  };

  if (!textures) return null;

  return (
    <group ref={root} position={[baseX, 0, 0]}>
      {/* soft contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} scale={[1, 0.55, 1]}>
        <circleGeometry args={[WIDTH * 0.55, 28]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
      </mesh>

      <group ref={tilt}>
        <mesh geometry={geometry} renderOrder={2}>
          <primitive object={material} attach="material" />
        </mesh>

        {prop && <HeldProp id={prop} />}

        {/* tears */}
        <group ref={tears} position={[0, EYE_Y, 0.06]} visible={false}>
          {[-EYE_X, EYE_X].flatMap((ex) =>
            [0, 1, 2].map((k) => (
              <mesh key={`${ex}${k}`} position={[ex * 0.98, 0, 0]} scale={[0.7, 1, 0.7]} material={TEAR_MATERIAL} renderOrder={4}>
                <sphereGeometry args={[0.02, 10, 8]} />
              </mesh>
            )),
          )}
        </group>

        {/* touch zones */}
        <mesh position={[0, PUPPET_HEIGHT * 0.82, 0.02]} onPointerDown={touch('head')} material={ZONE_MATERIAL}>
          <boxGeometry args={[WIDTH * 0.8, PUPPET_HEIGHT * 0.36, 0.1]} />
        </mesh>
        <mesh position={[0, PUPPET_HEIGHT * 0.44, 0.02]} onPointerDown={touch('body')} material={ZONE_MATERIAL}>
          <boxGeometry args={[WIDTH * 0.95, PUPPET_HEIGHT * 0.38, 0.1]} />
        </mesh>
        <mesh position={[0, PUPPET_HEIGHT * 0.12, 0.02]} onPointerDown={touch('feet')} material={ZONE_MATERIAL}>
          <boxGeometry args={[WIDTH * 0.8, PUPPET_HEIGHT * 0.24, 0.1]} />
        </mesh>
      </group>
    </group>
  );
};
