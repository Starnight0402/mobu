import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Memory } from '../types';
import { SHADOW_MAP } from '../lib/memoryCardStyle';

export interface MemorySphereHandle {
  recenter: () => void;
}

interface MemorySphereViewProps {
  memories: Memory[];
  onSelect: (memory: Memory) => void;
}

// Same idea as the old flat web view's hash-based placement: a card's angle
// on the sphere is derived from its chronological index, so the hall doesn't
// reshuffle every time a memory is added or edited — new cards just join the
// outside, existing ones hold their spot.
function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (Math.imul(h, 31) + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const REST_YAW = 8;
const REST_PITCH = -6;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.7;
const DRAG_SENSITIVITY = 0.26;
const PITCH_LIMIT = 78;

interface Placement {
  yaw: number;
  pitch: number;
  rFactor: number;
  w: number;
  h: number;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export const MemorySphereView = forwardRef<MemorySphereHandle, MemorySphereViewProps>(
  ({ memories, onSelect }, ref) => {
    const stageRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const moteRefs = useRef<{ el: HTMLDivElement; yaw: number; pitch: number; rFactor: number }[]>([]);
    // Bridges the ref handle (stable) to whatever the interaction effect's
    // current animateTo implementation is (recreated whenever placements change).
    const animateToRef = useRef<(yaw: number, pitch: number, zoom: number, onDone?: () => void) => void>(() => {});

    const n = memories.length;

    const placements = useMemo<Placement[]>(
      () =>
        memories.map((memory, i) => {
          const yFrac = n <= 1 ? 0 : 1 - (i / (n - 1)) * 2;
          const radiusAtY = Math.sqrt(Math.max(0, 1 - yFrac * yFrac));
          const theta = GOLDEN_ANGLE * i;
          const x = Math.cos(theta) * radiusAtY;
          const z = Math.sin(theta) * radiusAtY;
          const yaw = Math.atan2(x, z) * (180 / Math.PI);
          // Ease the poles toward the equator band so cards cluster where
          // you naturally look, rather than bunching at directly up/down.
          const pitch = Math.asin(clamp(yFrac, -1, 1)) * (180 / Math.PI) * 0.82;
          const jitter = 1 + (((hashSeed(memory._id + 'r') % 100) / 100 - 0.5) * 0.1);
          const w = clamp((memory.cardWidth || 220) * 0.6, 96, 190);
          const h = clamp((memory.cardHeight || 280) * 0.6, 124, 240);
          return { yaw, pitch, rFactor: jitter, w, h };
        }),
      [memories, n],
    );

    // Ambient depth particles — purely decorative, so a stable random set for
    // the component's lifetime is fine (no need to tie them to memory identity).
    const motes = useMemo(
      () =>
        Array.from({ length: 30 }, () => ({
          yaw: Math.random() * 360,
          pitch: (Math.random() * 2 - 1) * 80,
          rFactor: 0.3 + Math.random() * 1.05,
          opacity: 0.1 + Math.random() * 0.4,
        })),
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        recenter: () => animateToRef.current(REST_YAW, REST_PITCH, 1),
      }),
      [],
    );

    useEffect(() => {
      const stage = stageRef.current;
      const world = worldRef.current;
      if (!stage || !world) return;

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const s = { yaw: REST_YAW, pitch: REST_PITCH, zoom: 1, vYaw: 0, vPitch: 0, R: 0 };

      function applyWorld() {
        world!.style.transform = `scale(${s.zoom}) rotateX(${s.pitch}deg) rotateY(${s.yaw}deg)`;
      }

      function layout() {
        const w = stage!.clientWidth;
        const h = stage!.clientHeight;
        s.R = Math.min(w, h) * 0.46;
        stage!.style.perspective = `${Math.round(s.R * 1.75)}px`;
        cardRefs.current.forEach((el, i) => {
          if (!el) return;
          const p = placements[i];
          const r = s.R * p.rFactor;
          el.style.transform = `rotateY(${p.yaw}deg) rotateX(${p.pitch}deg) translateZ(${-r}px)`;
        });
        moteRefs.current.forEach((m) => {
          const r = s.R * m.rFactor;
          m.el.style.transform = `rotateY(${m.yaw}deg) rotateX(${m.pitch}deg) translateZ(${-r}px)`;
        });
      }

      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let idleRAF: number | null = null;
      let inertiaRAF: number | null = null;

      function stopIdle() {
        if (idleTimer) clearTimeout(idleTimer);
        if (idleRAF != null) cancelAnimationFrame(idleRAF);
        idleRAF = null;
      }
      function scheduleIdle() {
        if (idleTimer) clearTimeout(idleTimer);
        if (reducedMotion) return;
        idleTimer = setTimeout(() => {
          idleRAF = requestAnimationFrame(idleStep);
        }, 2600);
      }
      function idleStep() {
        s.yaw += 0.045;
        applyWorld();
        idleRAF = requestAnimationFrame(idleStep);
      }
      function stopInertia() {
        if (inertiaRAF != null) cancelAnimationFrame(inertiaRAF);
        inertiaRAF = null;
      }
      function inertiaStep() {
        s.vYaw *= 0.945;
        s.vPitch *= 0.945;
        s.yaw += s.vYaw;
        s.pitch = clamp(s.pitch + s.vPitch, -PITCH_LIMIT, PITCH_LIMIT);
        applyWorld();
        if (Math.abs(s.vYaw) > 0.003 || Math.abs(s.vPitch) > 0.003) {
          inertiaRAF = requestAnimationFrame(inertiaStep);
        } else {
          scheduleIdle();
        }
      }
      function animateTo(targetYaw: number, targetPitch: number, targetZoom: number, onDone?: () => void) {
        stopIdle();
        stopInertia();
        const startYaw = s.yaw;
        const startPitch = s.pitch;
        const startZoom = s.zoom;
        const dYaw = ((targetYaw - startYaw + 540) % 360) - 180;
        const start = performance.now();
        const dur = reducedMotion ? 1 : 700;
        function step(now: number) {
          const t = clamp((now - start) / dur, 0, 1);
          const e = easeOutCubic(t);
          s.yaw = startYaw + dYaw * e;
          s.pitch = startPitch + (targetPitch - startPitch) * e;
          s.zoom = startZoom + (targetZoom - startZoom) * e;
          applyWorld();
          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            onDone?.();
            scheduleIdle();
          }
        }
        requestAnimationFrame(step);
      }
      animateToRef.current = animateTo;

      let dragging = false;
      let moved = 0;
      let last = { x: 0, y: 0, t: 0 };
      const pointers = new Map<number, { x: number; y: number }>();
      let pinchStartDist: number | null = null;
      let pinchStartZoom = 1;

      function onPointerDown(e: PointerEvent) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        stopIdle();
        stopInertia();
        if (pointers.size === 2) {
          dragging = false;
          const pts = Array.from(pointers.values());
          pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          pinchStartZoom = s.zoom;
          return;
        }
        dragging = true;
        stage!.style.cursor = 'grabbing';
        try {
          stage!.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        last = { x: e.clientX, y: e.clientY, t: performance.now() };
        moved = 0;
        s.vYaw = 0;
        s.vPitch = 0;
      }
      function onPointerMove(e: PointerEvent) {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2 && pinchStartDist) {
          const pts = Array.from(pointers.values());
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          s.zoom = clamp(pinchStartZoom * (d / pinchStartDist), MIN_ZOOM, MAX_ZOOM);
          applyWorld();
          return;
        }
        if (!dragging) return;
        const now = performance.now();
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        const dt = Math.max(1, now - last.t);
        moved += Math.abs(dx) + Math.abs(dy);
        s.yaw += dx * DRAG_SENSITIVITY;
        s.pitch = clamp(s.pitch - dy * DRAG_SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT);
        s.vYaw = ((dx * DRAG_SENSITIVITY) / dt) * 16;
        s.vPitch = ((-dy * DRAG_SENSITIVITY) / dt) * 16;
        last = { x: e.clientX, y: e.clientY, t: now };
        applyWorld();
      }
      function endPointer(e: PointerEvent) {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchStartDist = null;
        if (!dragging) return;
        dragging = false;
        stage!.style.cursor = 'grab';
        if (moved < 6) {
          const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
          const idxAttr = hit?.closest('[data-memory-index]')?.getAttribute('data-memory-index');
          if (idxAttr != null) {
            const idx = Number(idxAttr);
            const memory = memories[idx];
            const p = placements[idx];
            if (memory && p) {
              animateTo(-p.yaw, -p.pitch * 0.6, 1.15, () => onSelect(memory));
            }
            return;
          }
        }
        if (!reducedMotion && (Math.abs(s.vYaw) > 0.01 || Math.abs(s.vPitch) > 0.01)) {
          inertiaRAF = requestAnimationFrame(inertiaStep);
        } else {
          scheduleIdle();
        }
      }
      function onWheel(e: WheelEvent) {
        e.preventDefault();
        stopIdle();
        s.zoom = clamp(s.zoom - e.deltaY * 0.0009, MIN_ZOOM, MAX_ZOOM);
        applyWorld();
        scheduleIdle();
      }

      stage.addEventListener('pointerdown', onPointerDown);
      stage.addEventListener('pointermove', onPointerMove);
      stage.addEventListener('pointerup', endPointer);
      stage.addEventListener('pointercancel', endPointer);
      stage.addEventListener('wheel', onWheel, { passive: false });

      const resizeObserver = new ResizeObserver(layout);
      resizeObserver.observe(stage);
      layout();
      applyWorld();
      scheduleIdle();

      return () => {
        stage.removeEventListener('pointerdown', onPointerDown);
        stage.removeEventListener('pointermove', onPointerMove);
        stage.removeEventListener('pointerup', endPointer);
        stage.removeEventListener('pointercancel', endPointer);
        stage.removeEventListener('wheel', onWheel);
        resizeObserver.disconnect();
        stopIdle();
        stopInertia();
      };
      // Re-running only when the angular layout changes (new/removed memory)
      // keeps an in-progress drag from being torn down by an unrelated
      // re-render; onSelect (setState from useState) is referentially stable.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placements]);

    return (
      <div ref={stageRef} className="absolute inset-0 touch-none select-none" style={{ cursor: 'grab' }}>
        <div
          ref={worldRef}
          className="absolute inset-0"
          style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
        >
          <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
            {motes.map((m, i) => (
              <div
                key={i}
                ref={(el) => {
                  if (el) moteRefs.current[i] = { el, yaw: m.yaw, pitch: m.pitch, rFactor: m.rFactor };
                }}
                className="absolute top-1/2 left-1/2 w-[3px] h-[3px] -ml-[1.5px] -mt-[1.5px] rounded-full bg-white pointer-events-none"
                style={{ opacity: m.opacity, transformStyle: 'preserve-3d' }}
              />
            ))}
          </div>
          <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
            {memories.map((memory, i) => (
              <SphereCard
                key={memory._id}
                memory={memory}
                index={i}
                width={placements[i].w}
                height={placements[i].h}
                cardRef={(el) => {
                  cardRefs.current[i] = el;
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  },
);
MemorySphereView.displayName = 'MemorySphereView';

const SphereCard: React.FC<{
  memory: Memory;
  index: number;
  width: number;
  height: number;
  cardRef: (el: HTMLDivElement | null) => void;
}> = ({ memory, index, width, height, cardRef }) => {
  const textSize = Math.min(memory.textSize || 14, 13);
  const fontFamily = memory.fontFamily || "'Caveat', cursive";
  const textColor = memory.textColor || '#000000';
  const bgColor = memory.bgColor || '#f8f8f8';
  const borderStyle = memory.borderStyle || 'none';
  const borderWidth = memory.borderWidth || 0;
  const borderColor = memory.borderColor || '#000000';
  const shadowEffect = memory.shadowEffect || 'xl';
  const bgImageOverlay = memory.bgImageOverlay || '';

  return (
    <div
      ref={cardRef}
      data-memory-index={index}
      className="absolute top-1/2 left-1/2 cursor-pointer"
      style={{
        width,
        height,
        marginTop: -height / 2,
        marginLeft: -width / 2,
        backfaceVisibility: 'hidden',
        transformStyle: 'preserve-3d',
      }}
    >
      <div
        className={`w-full h-full p-2.5 pb-8 rounded-sm ${SHADOW_MAP[shadowEffect] || 'shadow-xl'} flex flex-col relative`}
        style={{
          backgroundColor: bgColor,
          borderStyle,
          borderWidth: `${borderWidth}px`,
          borderColor,
          backgroundImage: bgImageOverlay ? `url(${bgImageOverlay})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundBlendMode: bgImageOverlay ? 'overlay' : 'normal',
        }}
      >
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-red-500 shadow-md border border-red-700 z-10">
          <div className="absolute inset-1 rounded-full bg-white/30" />
        </div>
        <div className="flex-1 w-full bg-black/5 overflow-hidden relative">
          <img
            src={memory.imageUrl}
            alt={memory.title}
            className="w-full h-full object-cover pointer-events-none"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center px-3">
          <p
            className="truncate w-full text-center"
            style={{ fontFamily, color: textColor, fontSize: `${textSize}px` }}
          >
            {memory.title}
          </p>
        </div>
      </div>
    </div>
  );
};
