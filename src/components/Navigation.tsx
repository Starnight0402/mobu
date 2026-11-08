import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Home,
  Plus,
  Image as ImageIcon,
  BarChart2,
  Settings,
  Clock,
  Target,
  Lock,
  Sparkles,
  Map as MapIcon,
  MessageCircle,
  Phone,
  MoreHorizontal,
  X,
  Scale,
  ListChecks,
  Bell,
  Brain,
  Swords,
  Heart,
  Smile,
  HeartPulse,
  Pill,
  FileText,
  Contact,
  Stethoscope,
  HandHeart,
  Thermometer,
  Activity,
  LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { hideDock, revealDock, useDockAutoHideActive, useDockHidden, useHideDockOnScroll } from '../lib/dock';
import { useNotifications } from './NotificationProvider';
import { haptic } from '../lib/haptics';
import { useBackHandler } from '../lib/backButtonStack';
import { OPEN_COMPOSER_EVENT, retapTab } from '../lib/navigation';
import { BottomSheet } from './BottomSheet';
import { setHealthIntent } from '../lib/healthIntent';

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

interface TabDef {
  id: string;
  icon: LucideIcon;
  label: string;
}

/*
 * Five places in the bar, always labelled: Home, Memories, Add, Chat, Us.
 * Everything else is one tap inside "Us", grouped; "Add" is one sheet for
 * anything you want to put in (memory, mood, expense, goal, capsule).
 */
const LEFT_TABS: TabDef[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'memories', icon: ImageIcon, label: 'Memories' },
];
const RIGHT_TABS: TabDef[] = [{ id: 'chat', icon: MessageCircle, label: 'Chat' }];
const PRIMARY_TABS: TabDef[] = [...LEFT_TABS, ...RIGHT_TABS];

const US_GROUPS: { title: string; tabs: TabDef[] }[] = [
  {
    title: 'Together',
    tabs: [
      { id: 'mini', icon: Heart, label: 'Mini us' },
      { id: 'call', icon: Phone, label: 'Call' },
      { id: 'goals', icon: Target, label: 'Goals' },
      { id: 'capsules', icon: Lock, label: 'Capsules' },
    ],
  },
  {
    title: 'Health',
    tabs: [
      { id: 'health', icon: HeartPulse, label: 'Health' },
      { id: 'health-meds', icon: Pill, label: 'Medicines' },
      { id: 'health-records', icon: FileText, label: 'Records' },
      { id: 'health-medid', icon: Contact, label: 'Medical ID' },
      { id: 'health-visits', icon: Stethoscope, label: 'Visits' },
      { id: 'health-care', icon: HandHeart, label: 'Care mode' },
    ],
  },
  {
    title: 'Our life',
    tabs: [
      { id: 'logs', icon: ListChecks, label: 'Logs' },
      { id: 'split', icon: Scale, label: 'Split' },
      { id: 'timeline', icon: Clock, label: 'Timeline' },
      { id: 'map', icon: MapIcon, label: 'Map' },
      { id: 'insights', icon: Sparkles, label: 'Insights' },
      { id: 'stats', icon: BarChart2, label: 'Stats' },
      { id: 'analyzer', icon: Brain, label: 'Analyzer' },
      { id: 'fights', icon: Swords, label: 'Fights' },
    ],
  },
  {
    title: 'You',
    tabs: [
      { id: 'notifications', icon: Bell, label: 'Alerts' },
      { id: 'settings', icon: Settings, label: 'Settings' },
    ],
  },
];
const MORE_TABS: TabDef[] = US_GROUPS.flatMap((g) => g.tabs);

const ADD_ACTIONS: { id: string; label: string; hint: string; icon: LucideIcon; tab: string; composer?: boolean; intent?: string }[] = [
  { id: 'memory', label: 'Memory', hint: 'Photos, a trip, a moment', icon: ImageIcon, tab: 'memories', composer: true },
  { id: 'log', label: 'Mood or log', hint: 'How the day went', icon: Smile, tab: 'track' },
  { id: 'expense', label: 'Expense', hint: 'Split a bill', icon: Scale, tab: 'split' },
  { id: 'goal', label: 'Goal', hint: 'Something to do together', icon: Target, tab: 'goals' },
  { id: 'capsule', label: 'Time capsule', hint: 'A note for later', icon: Lock, tab: 'capsules' },
  { id: 'h-report', label: 'Report or document', hint: 'Scan or upload a lab report, prescription, scan', icon: FileText, tab: 'health-records', intent: 'upload' },
  { id: 'h-reading', label: 'Health reading', hint: 'BP, sugar, weight, temperature', icon: Activity, tab: 'health-vitals', intent: 'log' },
  { id: 'h-medicine', label: 'Medicine', hint: 'Add one, with reminders', icon: Pill, tab: 'health-meds', intent: 'add' },
  { id: 'h-symptom', label: 'Symptom', hint: 'How you feel right now', icon: Thermometer, tab: 'health-symptoms', intent: 'log' },
];

/* ---------------------------------------------------------------------------
 * The dock's active-tab glow: "Hop".
 *
 * Switching tabs, the glow shrinks into a dot, jumps over the + in an arc and
 * lands on the new tab with a little spring. When it crosses the + (Memories
 * to Chat, say), the + ducks under it and the phone gives a short tick.
 * Neighbouring tabs get a smaller hop.
 *
 * It's one element measured inside the dock rather than a shared-layout
 * (layoutId) animation: the dock is position: fixed, and the page scrolling
 * to the top on a tab change leaked into the shared-layout measurement, so
 * the glow used to drop in from the top of the screen.
 * ------------------------------------------------------------------------- */

type DockKey = 'home' | 'memories' | 'chat' | 'us';
// Position in the bar; the + sits at 2.
const DOCK_INDEX: Record<DockKey, number> = { home: 0, memories: 1, chat: 3, us: 4 };
const PLUS_INDEX = 2;
const HOP_MS_CROSSING = 880;
const HOP_MS_NEIGHBOUR = 660;
// When, through the hop, the dot is over the +.
const PASS_AT = 0.48;

type Rect = { x: number; y: number; w: number; h: number; r?: number };

/** A damped spring as a CSS linear() easing, for the landing. */
function springEasing(stiffness: number, damping: number, fallback: string) {
  if (typeof CSS === 'undefined' || !CSS.supports('animation-timing-function', 'linear(0, 0.5, 1)')) {
    return fallback;
  }
  let x = 0;
  let v = 0;
  let t = 0;
  const dt = 1 / 240;
  const xs: number[] = [];
  while (t < 2.5) {
    v += (-stiffness * (x - 1) - damping * v) * dt;
    x += v * dt;
    t += dt;
    xs.push(x);
    if (t > 0.1 && Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.02) break;
  }
  const step = Math.max(1, Math.floor(xs.length / 60));
  const pts = ['0'];
  for (let i = step; i < xs.length - 1; i += step) pts.push(xs[i].toFixed(4));
  pts.push('1');
  return `linear(${pts.join(', ')})`;
}
const LANDING = springEasing(380, 20, 'cubic-bezier(.2,1.45,.4,1)');

const toFrame = (r: Rect, extra: Keyframe = {}): Keyframe => ({
  left: `${r.x}px`,
  top: `${r.y}px`,
  width: `${r.w}px`,
  height: `${r.h}px`,
  borderRadius: `${r.r ?? 16}px`,
  ...extra,
});
const centerOf = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const dotAt = (cx: number, cy: number, s: number): Rect => ({ x: cx - s / 2, y: cy - s / 2, w: s, h: s, r: s / 2 });

function rectIn(el: HTMLElement, dock: HTMLElement): Rect {
  const a = el.getBoundingClientRect();
  const d = dock.getBoundingClientRect();
  return { x: a.left - d.left - dock.clientLeft, y: a.top - d.top - dock.clientTop, w: a.width, h: a.height };
}

function hopFrames(from: Rect, to: Rect, plus: Rect, crossing: boolean, pill: string, accent: string): Keyframe[] {
  // Over the + when crossing it; a small hop between neighbours.
  const peak = crossing ? plus.y - 16 : Math.min(centerOf(from).y, centerOf(to).y) - 22;
  return arcFrames(from, to, peak, pill, pill, accent);
}

/** Squeeze into a dot, arc up to `peak`, land with a spring and open into `to`. */
function arcFrames(from: Rect, to: Rect, peak: number, startBg: string, endBg: string, accent: string): Keyframe[] {
  const size = 12;
  const f = centerOf(from);
  const t = centerOf(to);
  const frames: Keyframe[] = [
    toFrame(from, { offset: 0, backgroundColor: startBg, easing: 'cubic-bezier(.5,0,.8,.3)' }),
    toFrame(dotAt(f.x, f.y, size), { offset: 0.18, backgroundColor: accent }),
  ];
  // Constant sideways speed with a parabola for height reads as a real jump.
  const steps = 14;
  for (let i = 1; i < steps; i++) {
    const u = i / steps;
    const x = f.x + (t.x - f.x) * u;
    const y = f.y + (t.y - f.y) * u - (f.y - peak) * 4 * u * (1 - u);
    frames.push(toFrame(dotAt(x, y, size), { offset: 0.18 + 0.6 * u, backgroundColor: accent }));
  }
  frames.push(toFrame(dotAt(t.x, t.y, size), { offset: 0.78, backgroundColor: accent, easing: LANDING }));
  frames.push(toFrame(to, { offset: 1, backgroundColor: endBg }));
  return frames;
}

function useHopIndicator(activeKey: DockKey | null) {
  const dockRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Partial<Record<DockKey, HTMLElement | null>>>({});
  const shownKey = useRef<DockKey | null>(null);
  const running = useRef<{ ind?: Animation; plus?: Animation; tick?: number }>({});

  const stop = () => {
    running.current.ind?.cancel();
    running.current.plus?.cancel();
    window.clearTimeout(running.current.tick);
    running.current = {};
  };

  const place = (ind: HTMLElement, r: Rect) => {
    Object.assign(ind.style, {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.w}px`,
      height: `${r.h}px`,
      borderRadius: '16px',
    });
  };

  useLayoutEffect(() => {
    const dock = dockRef.current;
    const ind = indRef.current;
    if (!dock || !ind) return;
    const fromKey = shownKey.current;
    shownKey.current = activeKey;

    // Start from wherever the glow is right now, so a quick second tap
    // redirects it mid-air instead of snapping back first.
    const midAir = running.current.ind?.playState === 'running';
    const fromEl = fromKey ? tabRefs.current[fromKey] : null;
    let from: Rect | null = null;
    if (midAir) {
      const cs = getComputedStyle(ind);
      from = { x: parseFloat(cs.left), y: parseFloat(cs.top), w: parseFloat(cs.width), h: parseFloat(cs.height), r: parseFloat(cs.borderTopLeftRadius) || 16 };
    } else if (fromEl) {
      from = rectIn(fromEl, dock);
    }
    stop();

    const toEl = activeKey ? tabRefs.current[activeKey] : null;
    if (!toEl) {
      // A screen the bar doesn't show (the tracking form): no glow.
      ind.style.opacity = '0';
      return;
    }
    const to = rectIn(toEl, dock);
    place(ind, to);
    ind.style.opacity = '1';

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!from || !fromKey || !activeKey || fromKey === activeKey || reduced) return;

    const crossing = Math.sign(DOCK_INDEX[fromKey] - PLUS_INDEX) !== Math.sign(DOCK_INDEX[activeKey] - PLUS_INDEX);
    const plusEl = plusRef.current;
    const plus = plusEl ? rectIn(plusEl, dock) : { x: 0, y: 0, w: 0, h: 0 };
    const pill = getComputedStyle(ind).backgroundColor;
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--color-nothing-purple').trim() || '#c3a6ff';
    const duration = crossing ? HOP_MS_CROSSING : HOP_MS_NEIGHBOUR;

    const anim = ind.animate(hopFrames(from, to, plus, crossing, pill, accent), { duration, fill: 'backwards' });
    running.current.ind = anim;
    anim.onfinish = () => {
      if (running.current.ind === anim) running.current = {};
    };

    if (crossing && plusEl) {
      // The + ducks as the dot sails over it, and the phone ticks right then.
      running.current.plus = plusEl.animate(
        [
          { transform: 'scale(1)', offset: 0 },
          { transform: 'scale(1)', offset: PASS_AT - 0.1 },
          { transform: 'scale(0.9)', offset: PASS_AT },
          { transform: 'scale(1.05)', offset: PASS_AT + 0.14 },
          { transform: 'scale(1)', offset: 1 },
        ],
        { duration },
      );
      running.current.tick = window.setTimeout(() => haptic('tick'), duration * PASS_AT);
    }
  }, [activeKey]);

  // Keep it on its tab when the dock resizes (rotation, font load).
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const ind = indRef.current;
      const key = shownKey.current;
      const el = key ? tabRefs.current[key] : null;
      if (!ind || !el || running.current.ind) return;
      place(ind, rectIn(el, dock));
    });
    ro.observe(dock);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => stop(), []);

  return { dockRef, indRef, plusRef, tabRefs };
}

/* ---------------------------------------------------------------------------
 * Tucking the dock away (Chat): the glow hops into the handle.
 *
 * Hiding: the icons and + fade out, and the active tab's glow does the same
 * hop it does between tabs (squeeze into the lilac dot, arc, spring) but lands
 * in the handle spot and opens into the handle itself. The glass bar shrinks
 * away underneath it. Bringing it back is the same hop in reverse: the handle
 * squeezes into the dot and hops back onto the tab while the bar grows under
 * it. So the glow, the bar and the handle read as one object.
 *
 * Two fixed elements do it: the "shape" (the glass, motion springs) and the
 * "traveller" (the glow, WAAPI keyframes shared with the tab hop). Both are
 * measured in viewport space, so page scroll can't throw them off. Without a
 * glow (a screen the bar doesn't show) the glass alone morphs into the pill.
 * ------------------------------------------------------------------------- */

const TUCK_HOP_MS = 900;

type DockPhase = 'docked' | 'hiding' | 'tucked' | 'revealing';
type ShapeBox = { x: number; y: number; w: number; h: number; r: number; bg: string; border: string };

function boxOf(el: HTMLElement): ShapeBox {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    x: r.left,
    y: r.top,
    w: r.width,
    h: r.height,
    r: parseFloat(cs.borderTopLeftRadius) || 0,
    bg: cs.backgroundColor,
    border: cs.borderTopColor,
  };
}

// Duration-based, so it ends on time: a stiffness spring over a few hundred
// pixels keeps settling sub-pixel for another second, and the handle isn't
// tappable until the morph has finished.
const MORPH_SPRING = { type: 'spring' as const, duration: 0.55, bounce: 0.12 };
const ICON_FADE_S = 0.16;

function viewRect(el: HTMLElement, radius?: number): Rect {
  const r = el.getBoundingClientRect();
  const cssR = radius ?? (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
  // rounded-full computes to 9999px; clamp so the radius tweens sensibly.
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: Math.min(cssR, r.height / 2, r.width / 2) };
}

type Morph = { key: number; dir: 'hide' | 'reveal'; from: ShapeBox; to: ShapeBox; travel: boolean };

function useDockMorph(
  hidden: boolean,
  dockRef: React.RefObject<HTMLDivElement | null>,
  indRef: React.RefObject<HTMLDivElement | null>,
  activeTabEl: () => HTMLElement | null | undefined,
) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const shapeRef = useRef<HTMLDivElement>(null);
  const travelRef = useRef<HTMLDivElement>(null);
  const travelAnim = useRef<Animation | null>(null);
  const [phase, setPhase] = useState<DockPhase>(hidden ? 'tucked' : 'docked');
  const [morph, setMorph] = useState<Morph | null>(null);
  // True while the glow is out of the bar (hopping, or sitting in as the handle
  // mid-tuck); the real glow stays hidden until the traveller lands back on it.
  const [travelling, setTravelling] = useState(false);
  const keyRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useLayoutEffect(() => {
    const dock = dockRef.current;
    const pill = pillRef.current;
    const p = phaseRef.current;
    const wantHide = hidden && (p === 'docked' || p === 'revealing');
    const wantReveal = !hidden && (p === 'tucked' || p === 'hiding');
    if (!wantHide && !wantReveal) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!dock || !pill || reduced) {
      travelAnim.current?.cancel();
      travelAnim.current = null;
      setTravelling(false);
      setMorph(null);
      setPhase(hidden ? 'tucked' : 'docked');
      return;
    }
    const dockBox = boxOf(dock);
    const pillBox = boxOf(pill);
    // Changing direction mid-morph starts from wherever the shape is now.
    const current = shapeRef.current ? boxOf(shapeRef.current) : null;

    // The glow's hop, if there's a glow to hop with.
    const ind = indRef.current;
    const tab = activeTabEl();
    const t = travelRef.current;
    const travel = !!(ind && tab && t && ind.style.opacity !== '0');
    if (travel) {
      const tile = viewRect(tab, 16);
      const handle = viewRect(pill);
      const tileBg = getComputedStyle(ind).backgroundColor;
      const pillBg = pillBox.bg;
      const accent =
        getComputedStyle(document.documentElement).getPropertyValue('--color-nothing-purple').trim() || '#c3a6ff';
      const midAir = travelAnim.current?.playState === 'running' || travelAnim.current?.playState === 'finished';
      const cs = getComputedStyle(t);
      const from: Rect = midAir
        ? { x: parseFloat(cs.left), y: parseFloat(cs.top), w: parseFloat(cs.width), h: parseFloat(cs.height), r: parseFloat(cs.borderTopLeftRadius) || 0 }
        : wantHide
          ? tile
          : handle;
      const fromBg = midAir ? cs.backgroundColor : wantHide ? tileBg : pillBg;
      travelAnim.current?.cancel();
      // The arc clears the top of the bar, like a tab hop clears the +.
      const peak = dockBox.y - 22;
      const anim = t.animate(arcFrames(from, wantHide ? handle : tile, peak, fromBg, wantHide ? pillBg : tileBg, accent), {
        duration: TUCK_HOP_MS,
        delay: wantHide ? 0 : 60,
        fill: 'both',
      });
      travelAnim.current = anim;
      t.style.opacity = '1';
      setTravelling(true);
      anim.onfinish = () => {
        if (travelAnim.current !== anim) return;
        if (wantHide) {
          // Landed in the handle: it is the handle now.
          setPhase((ph) => (ph === 'hiding' ? 'tucked' : ph));
        } else {
          travelAnim.current = null;
          setTravelling(false);
        }
      };
    } else {
      travelAnim.current?.cancel();
      travelAnim.current = null;
      setTravelling(false);
    }

    keyRef.current += 1;
    // With a traveller, the glass stays glass the whole way: the glow becomes
    // the handle, the glass only shrinks away beneath it.
    const glass = { bg: dockBox.bg, border: dockBox.border };
    setMorph(
      wantHide
        ? { key: keyRef.current, dir: 'hide', travel, from: current ?? dockBox, to: travel ? { ...pillBox, ...glass } : pillBox }
        : { key: keyRef.current, dir: 'reveal', travel, from: current ?? (travel ? { ...pillBox, ...glass } : pillBox), to: dockBox },
    );
    setPhase(wantHide ? 'hiding' : 'revealing');
  }, [hidden, dockRef]);

  // Tucked: the real handle has taken over from the traveller, in the same
  // commit, so there's no frame with neither.
  useLayoutEffect(() => {
    const t = travelRef.current;
    if (!t) return;
    if (phase === 'tucked' || !travelling) {
      t.style.opacity = '0';
      if (phase === 'tucked' || phase === 'docked') {
        travelAnim.current?.cancel();
        travelAnim.current = null;
      }
    }
  }, [phase, travelling]);
  useEffect(() => {
    if (phase === 'tucked') setTravelling(false);
  }, [phase]);

  const fadeGlassOut = morph?.travel && morph.dir === 'hide';
  const fadeGlassIn = morph?.travel && morph.dir === 'reveal';
  const shape = (
    <AnimatePresence>
      {/* Only while morphing; once docked or tucked the real bar or handle has
          taken over and the shape fades away. */}
      {morph && (phase === 'hiding' || phase === 'revealing') && (
        <motion.div
          key={morph.key}
          ref={shapeRef}
          aria-hidden="true"
          className="pointer-events-none fixed z-[49] border shadow-2xl"
          initial={{
            left: morph.from.x,
            top: morph.from.y,
            width: morph.from.w,
            height: morph.from.h,
            borderRadius: morph.from.r,
            backgroundColor: morph.from.bg,
            borderColor: morph.from.border,
            opacity: fadeGlassIn ? 0 : 1,
          }}
          animate={{
            left: morph.to.x,
            top: morph.to.y,
            width: morph.to.w,
            height: morph.to.h,
            borderRadius: morph.to.r,
            backgroundColor: morph.to.bg,
            borderColor: morph.to.border,
            // With the glow hopping in, the glass melts away as it reaches
            // the handle spot instead of becoming the handle.
            opacity: fadeGlassOut ? 0 : 1,
            // Hiding waits for the icons to fade out of the bar first. The
            // colour stays glass until the shape is nearly pill-sized (a big
            // light-grey bar looked heavy), and turns back to glass at once
            // when growing.
            transition: {
              ...MORPH_SPRING,
              delay: morph.dir === 'hide' ? ICON_FADE_S * 0.8 : 0,
              opacity: fadeGlassOut
                ? // Gone just as the dot lands in the handle.
                  { duration: 0.22, ease: 'easeIn', delay: ICON_FADE_S * 0.8 + 0.42 }
                : { duration: 0.1, ease: 'easeOut' },
              backgroundColor:
                morph.dir === 'hide'
                  ? { duration: 0.22, ease: 'easeOut', delay: ICON_FADE_S * 0.8 + 0.3 }
                  : { duration: 0.16, ease: 'easeOut' },
              borderColor:
                morph.dir === 'hide'
                  ? { duration: 0.22, ease: 'easeOut', delay: ICON_FADE_S * 0.8 + 0.3 }
                  : { duration: 0.16, ease: 'easeOut' },
            },
          }}
          // Revealed: the real bar has faded in on top; let the shape go.
          exit={{ opacity: 0, transition: { duration: 0.18, delay: 0.06 } }}
          onAnimationComplete={(def) => {
            if (typeof def === 'object' && def && 'opacity' in def && !('left' in def)) return;
            // With a traveller, its landing ends the tuck (see above).
            if (morph.dir === 'hide' && morph.travel) return;
            setPhase((p) => (morph.dir === 'hide' && p === 'hiding' ? 'tucked' : morph.dir === 'reveal' && p === 'revealing' ? 'docked' : p));
          }}
        />
      )}
    </AnimatePresence>
  );

  const traveller = (
    <div ref={travelRef} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[51] opacity-0" />
  );

  return { phase, pillRef, shape, traveller, travelling };
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { unreadByTab } = useNotifications();

  useBackHandler(moreOpen, () => setMoreOpen(false));
  useBackHandler(addOpen, () => setAddOpen(false));

  const moreIsActive = MORE_TABS.some((t) => t.id === activeTab) || activeTab.startsWith('health');
  const isPrimary = PRIMARY_TABS.some((t) => t.id === activeTab);
  const glowKey: DockKey | null = moreOpen
    ? 'us'
    : isPrimary
      ? (activeTab as DockKey)
      : moreIsActive
        ? 'us'
        : null;
  const { dockRef, indRef, plusRef, tabRefs } = useHopIndicator(glowKey);

  // Chat tucks the dock away (lib/dock.ts); a handle brings it back.
  const dockHidden = useDockHidden();
  const autoHide = useDockAutoHideActive();
  useHideDockOnScroll();
  const {
    phase: dockPhase,
    pillRef,
    shape: morphShape,
    traveller,
    travelling,
  } = useDockMorph(dockHidden, dockRef, indRef, () => (glowKey ? tabRefs.current[glowKey] : null));
  const docked = dockPhase === 'docked';
  const tucked = dockPhase === 'tucked';
  const handleDragY = useRef<number | null>(null);
  const handleSwiped = useRef(false);

  // Anything the bar doesn't badge directly rolls up onto the More button, so
  // no notification is invisible just because its screen is behind the sheet.
  const primaryIds = new Set(PRIMARY_TABS.map((t) => t.id));
  const moreUnread = Object.entries(unreadByTab)
    .filter(([tab]) => !primaryIds.has(tab))
    .reduce((sum, [, count]) => sum + count, 0);

  const go = (tab: string) => {
    haptic('select');
    if (tab === activeTab) {
      // Tapping the screen you're on: back to its top (or the screen's own
      // "home" position, e.g. Chat's newest message), like any native tab bar.
      setMoreOpen(false);
      if (!retapTab(tab)) window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setActiveTab(tab);
  };

  // Close the sheet whenever navigation happens from anywhere (a dashboard
  // card, a deep link) so it can't be left hanging over the new screen.
  useEffect(() => {
    setMoreOpen(false);
    setAddOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!moreOpen && !addOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setMoreOpen(false), setAddOpen(false));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen, addOpen]);

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <BottomSheet
            key="us"
            label="Us"
            onClose={() => setMoreOpen(false)}
            z={60}
            backdropClassName="bg-black/70 backdrop-blur-sm"
          >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-white/40">Us</h2>
                <button
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close menu"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/60 transition-colors hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-[62dvh] space-y-4 overflow-y-auto pb-2 no-scrollbar">
                {US_GROUPS.map((group) => (
                  <section key={group.title}>
                    <h3 className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/40">{group.title}</h3>
                    <div className="grid grid-cols-4 gap-2">
                      {group.tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        const count = unreadByTab[tab.id] ?? 0;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => go(tab.id)}
                            className={`relative flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-2xl border p-2 transition-all active:scale-95 ${
                              isActive
                                ? 'border-nothing-purple/50 bg-nothing-purple/15 text-white'
                                : 'border-white/8 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
                            }`}
                          >
                            {count > 0 && <Badge count={count} className="right-1.5 top-1.5" />}
                            <Icon size={20} />
                            <span className="text-[11px] tracking-wide">{tab.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addOpen && (
          <BottomSheet key="add" label="Add something" onClose={() => setAddOpen(false)} z={60}>
              <h2 className="mb-3 text-xl font-medium">Add something</h2>
              <div className="space-y-2">
                {ADD_ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        haptic('select');
                        // Close explicitly: when you're already on that screen
                        // there's no navigation to close it, and it used to stay open.
                        setAddOpen(false);
                        if (a.composer) {
                          if (activeTab === a.tab) {
                            // Memories is already mounted, so it won't read the flag below.
                            window.dispatchEvent(new Event(OPEN_COMPOSER_EVENT));
                            return;
                          }
                          try {
                            sessionStorage.setItem('mobu-open-composer', '1');
                          } catch {
                            // Without storage the user just lands on Memories and taps +.
                          }
                        }
                        if (a.intent) setHealthIntent(a.tab, a.intent);
                        setActiveTab(a.tab);
                      }}
                      className="flex min-h-[56px] w-full items-center gap-4 rounded-2xl border border-white/8 bg-surface px-4 py-3 text-left transition-colors hover:bg-raised active:scale-[0.99]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral/15 text-coral">
                        <Icon size={19} />
                      </span>
                      <span className="flex-1">
                        <span className="block text-[15px] font-medium">{a.label}</span>
                        <span className="block text-xs text-white/50">{a.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      {/* The handle that brings a tucked-away dock back: tap it or swipe up.
          Always laid out (so the morph can measure where the pill sits), but
          only visible and tappable once the dock has shrunk into it. */}
      <button
        type="button"
        aria-label="Show navigation"
        aria-hidden={!tucked || undefined}
        tabIndex={tucked ? 0 : -1}
        data-no-haptic
        data-dock-handle
        onClick={() => {
          // A swipe already handled it.
          if (handleSwiped.current) {
            handleSwiped.current = false;
            return;
          }
          haptic('reveal');
          revealDock();
        }}
        onPointerDown={(e) => {
          handleDragY.current = e.clientY;
          handleSwiped.current = false;
        }}
        onPointerUp={(e) => {
          const start = handleDragY.current;
          handleDragY.current = null;
          // A swipe up reveals too (the click above covers a plain tap).
          if (start != null && start - e.clientY > 12) {
            handleSwiped.current = true;
            haptic('reveal');
            revealDock();
          }
        }}
        className="fixed left-1/2 z-50 flex h-8 w-36 -translate-x-1/2 items-center justify-center"
        style={{
          bottom: 'max(0.25rem, env(safe-area-inset-bottom))',
          touchAction: 'none',
          opacity: tucked ? 1 : 0,
          pointerEvents: tucked ? 'auto' : 'none',
        }}
      >
        <span ref={pillRef} className="h-1.5 w-11 rounded-full border border-transparent bg-white/35" />
      </button>

      {morphShape}
      {traveller}

      <motion.nav
        className="fixed left-0 right-0 z-50 px-3"
        style={{
          bottom: 'max(0.75rem, calc(env(safe-area-inset-bottom) + 0.25rem))',
          // A vertical swipe on the dock hides it (on screens that tuck it away).
          touchAction: autoHide ? 'none' : undefined,
          pointerEvents: docked ? undefined : 'none',
        }}
        initial={false}
        // The bar stays put; its contents fade out of the glass as the morph
        // shape takes over, and fade back in once the shape has grown back.
        // No scale: the glow's hop back measures the tabs while it's hidden.
        animate={{ opacity: docked ? 1 : 0 }}
        transition={{ duration: docked ? 0.2 : ICON_FADE_S, ease: [0.32, 0.72, 0, 1] }}
        aria-hidden={!docked || undefined}
        inert={!docked}
        onPanEnd={(_e, info) => {
          if (autoHide && info.offset.y > 24 && Math.abs(info.offset.y) > Math.abs(info.offset.x)) {
            haptic('tick');
            hideDock();
          }
        }}
      >
        <div
          ref={dockRef}
          className="glass relative mx-auto flex max-w-md items-stretch justify-around gap-1 p-1.5 shadow-2xl"
        >
          {/* The hopping glow (useHopIndicator). Behind the tabs and the +. */}
          {/* Hidden while it's out of the bar as the tuck traveller (useDockMorph). */}
          <div
            ref={indRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 rounded-2xl bg-white/10"
            style={{ visibility: docked && !travelling ? 'visible' : 'hidden' }}
          />
          {LEFT_TABS.map((tab) => (
            <NavButton
              key={tab.id}
              tab={tab}
              isActive={glowKey === tab.id}
              count={unreadByTab[tab.id] ?? 0}
              onClick={() => go(tab.id)}
              innerRef={(el) => { tabRefs.current[tab.id as DockKey] = el; }}
            />
          ))}
          <div className="relative z-10 flex min-w-[64px] flex-1 items-center justify-center">
            <button
              ref={plusRef}
              onClick={() => {
                haptic('select');
                setMoreOpen(false);
                setAddOpen((v) => !v);
              }}
              aria-label="Add"
              aria-expanded={addOpen}
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-coral text-black shadow-xl ring-4 ring-black transition-transform active:scale-90"
            >
              <Plus size={26} className={`transition-transform duration-200 ${addOpen ? 'rotate-45' : ''}`} />
            </button>
          </div>
          {RIGHT_TABS.map((tab) => (
            <NavButton
              key={tab.id}
              tab={tab}
              isActive={glowKey === tab.id}
              count={unreadByTab[tab.id] ?? 0}
              onClick={() => go(tab.id)}
              innerRef={(el) => { tabRefs.current[tab.id as DockKey] = el; }}
            />
          ))}
          <NavButton
            tab={{ id: 'us', icon: Heart, label: 'Us' }}
            isActive={glowKey === 'us'}
            innerRef={(el) => { tabRefs.current.us = el; }}
            count={moreUnread}
            onClick={() => {
              haptic('select');
              setAddOpen(false);
              setMoreOpen((v) => !v);
            }}
          />
        </div>
      </motion.nav>
    </>
  );
};

const Badge: React.FC<{ count: number; className?: string }> = ({ count, className = '' }) => (
  <span
    className={`absolute z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-nothing-purple px-1 text-[9px] font-medium leading-none text-white shadow-[0_0_8px_rgba(168,85,247,0.7)] ${className}`}
  >
    {count > 9 ? '9+' : count}
  </span>
);

const NavButton: React.FC<{
  tab: TabDef;
  isActive: boolean;
  count: number;
  onClick: () => void;
  innerRef?: (el: HTMLButtonElement | null) => void;
}> = ({ tab, isActive, count, onClick, innerRef }) => {
  const Icon = tab.icon;
  return (
    <button
      ref={innerRef}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      aria-label={count > 0 ? `${tab.label}, ${count} unread` : tab.label}
      /* min-h/min-w keep every target at or above the 44px touch minimum. */
      className={`relative flex min-h-[52px] min-w-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${
        isActive ? 'text-white' : 'text-white/40'
      }`}
    >
      {count > 0 && <Badge count={count} className="right-2 top-1" />}
      <Icon size={19} className="relative" />
      <span className="relative text-[10px] leading-none tracking-wide">{tab.label}</span>
    </button>
  );
};
