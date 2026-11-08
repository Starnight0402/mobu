import React, { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useConvex, useConvexAuth } from 'convex/react';
import {
  clearQueryCache,
  hasCachedSession,
  prefetchQuery,
  recoverFromSnapshotError,
  setSessionReady,
  useMutation,
  useQuery,
} from './lib/queryCache';
import { Navigation } from './components/Navigation';
import { PullToRefresh } from './components/PullToRefresh';
import { useAndroidBackButton } from './lib/useAndroidBackButton';
import {
  initialTab,
  markHistoryLanding,
  onGoToTab,
  pushTab,
  rememberTab,
  replaceTab,
  restoreScroll,
  tabFromHash,
  takeRestoreTarget,
} from './lib/navigation';
import { DialogHost } from './components/Dialog';
import { Dashboard } from './components/Dashboard';
import { SignInScreen } from './components/SignInScreen';
import { NameSetup } from './components/NameSetup';
import { LightboxProvider } from './components/Lightbox';
import { CallProvider } from './components/CallProvider';
import { NotificationProvider, useNotifications } from './components/NotificationProvider';
import { CHAT_PAGE } from './lib/chat';
import { motion, MotionConfig } from 'motion/react';
import { api } from '../convex/_generated/api';

/**
 * A screen split into its own chunk, plus `preload()` to fetch that chunk
 * before the first visit. Every screen except Home loads this way, so the
 * sign-in screen and Home don't wait on recharts, d3, Google Maps and the
 * rest; usePrefetchScreens() then warms the chunks while the app is idle, so
 * a tab tap is still instant.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyScreen<T extends React.ComponentType<any>>(load: () => Promise<T>) {
  let pending: Promise<{ default: T }> | undefined;
  const preload = () => (pending ??= load().then((component) => ({ default: component })));
  return Object.assign(React.lazy(preload), { preload });
}

const TrackingForm = lazyScreen(() => import('./components/TrackingForm').then((m) => m.TrackingForm));
const MemoryBoard = lazyScreen(() => import('./components/MemoryBoard').then((m) => m.MemoryBoard));
const StatsView = lazyScreen(() => import('./components/StatsView').then((m) => m.StatsView));
const SplitView = lazyScreen(() => import('./components/SplitView').then((m) => m.SplitView));
const LogsView = lazyScreen(() => import('./components/LogsView').then((m) => m.LogsView));
const SettingsView = lazyScreen(() => import('./components/SettingsView').then((m) => m.SettingsView));
const TimelineView = lazyScreen(() => import('./components/TimelineView').then((m) => m.TimelineView));
const GoalsView = lazyScreen(() => import('./components/GoalsView').then((m) => m.GoalsView));
const CapsulesView = lazyScreen(() => import('./components/CapsulesView').then((m) => m.CapsulesView));
const InsightsView = lazyScreen(() => import('./components/InsightsView').then((m) => m.InsightsView));
const RelationshipAnalyzerView = lazyScreen(() =>
  import('./components/RelationshipAnalyzerView').then((m) => m.RelationshipAnalyzerView),
);
const FightLogView = lazyScreen(() => import('./components/FightLogView').then((m) => m.FightLogView));
const MapView = lazyScreen(() => import('./components/MapView').then((m) => m.MapView));
const ChatView = lazyScreen(() => import('./components/ChatView').then((m) => m.ChatView));
const CallView = lazyScreen(() => import('./components/CallView').then((m) => m.CallView));
const NotificationsView = lazyScreen(() =>
  import('./components/NotificationsView').then((m) => m.NotificationsView),
);
// Health: every screen is its own chunk, so none of it weighs on the first load.
const HealthHome = lazyScreen(() => import('./components/health/HealthHome').then((m) => m.HealthHome));
const HealthRecords = lazyScreen(() => import('./components/health/RecordsView').then((m) => m.RecordsView));
const HealthLabs = lazyScreen(() => import('./components/health/LabsView').then((m) => m.LabsView));
const HealthVitals = lazyScreen(() => import('./components/health/VitalsView').then((m) => m.VitalsView));
const HealthMeds = lazyScreen(() => import('./components/health/MedsView').then((m) => m.MedsView));
const HealthVisits = lazyScreen(() => import('./components/health/VisitsView').then((m) => m.VisitsView));
const HealthPrevention = lazyScreen(() => import('./components/health/PreventionView').then((m) => m.PreventionView));
const HealthSymptoms = lazyScreen(() => import('./components/health/SymptomsView').then((m) => m.SymptomsView));
const HealthCare = lazyScreen(() => import('./components/health/CareView').then((m) => m.CareView));
const HealthMedId = lazyScreen(() => import('./components/health/MedIdView').then((m) => m.MedIdView));
const HealthHistory = lazyScreen(() => import('./components/health/HistoryView').then((m) => m.HistoryView));
const HealthCycle = lazyScreen(() => import('./components/health/CycleView').then((m) => m.CycleView));
const HealthMind = lazyScreen(() => import('./components/health/MindView').then((m) => m.MindView));
const HealthInsurance = lazyScreen(() => import('./components/health/InsuranceView').then((m) => m.InsuranceView));
const HealthShare = lazyScreen(() => import('./components/health/ShareView').then((m) => m.ShareView));
const HealthSettings = lazyScreen(() => import('./components/health/SettingsHealth').then((m) => m.SettingsHealth));
const HealthBridge = lazyScreen(() => import('./components/health/HealthBridge').then((m) => m.HealthBridge));
// Deliberately not in PRELOAD: three.js plus ~400 KB of character art per
// expression, fetched only when someone actually opens Mini.
const MiniWorldView = lazyScreen(() => import('./components/mini/MiniWorldView').then((m) => m.MiniWorldView));

/** Chat first: it's the most-opened screen after Home. */
const PRELOAD = [
  ChatView, SplitView, MemoryBoard, TrackingForm, GoalsView, CapsulesView, TimelineView, NotificationsView,
  SettingsView, LogsView, InsightsView, StatsView, FightLogView, CallView, MapView, RelationshipAnalyzerView,
  HealthHome, HealthRecords, HealthMeds, HealthVitals, HealthLabs, HealthVisits,
];

export default function App() {
  return (
    // reducedMotion="user": people who've turned animations down in their OS
    // settings get instant transitions instead of slides and springs.
    <MotionConfig reducedMotion="user">
    <PullToRefresh>
      <DialogHost />
      <LightboxProvider>
        <SessionGate />
      </LightboxProvider>
    </PullToRefresh>
    </MotionConfig>
  );
}

function ScreenLoading() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center" role="status" aria-label="Loading">
      <div className="w-2 h-2 rounded-full bg-nothing-purple animate-pulse" />
    </div>
  );
}

function Splash() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="w-2 h-2 rounded-full bg-nothing-purple animate-pulse" />
    </div>
  );
}

/**
 * Replaces Convex's <AuthLoading>/<Authenticated>/<Unauthenticated>.
 *
 * Confirming the saved login with the server takes a round trip on every cold
 * start, and that used to be a blank splash followed by every screen loading.
 * If this device was signed in last time, the app is drawn straight away from
 * saved snapshots (lib/queryCache.ts) while that check runs; live queries and
 * any mutations wait for it. It's the same tree either way, so nothing
 * remounts when the check completes.
 */
function SessionGate() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  useLayoutEffect(() => setSessionReady(isAuthenticated), [isAuthenticated]);

  // Signed out (or the saved login was rejected): nothing from that session
  // may stay on the device.
  const signedOut = !isLoading && !isAuthenticated;
  useEffect(() => {
    if (signedOut) clearQueryCache();
  }, [signedOut]);

  if (isAuthenticated || (isLoading && hasCachedSession())) {
    return (
      <SnapshotErrorBoundary>
        {/* CallProvider lives above the tab switch so a call survives
            navigation and the incoming-call sheet can appear from any screen. */}
        <CallProvider>
          <AuthenticatedApp />
        </CallProvider>
      </SnapshotErrorBoundary>
    );
  }
  if (isLoading) return <Splash />;
  return <SignInScreen />;
}

/**
 * A saved snapshot from an older build can be in a shape the current code
 * doesn't expect. If rendering crashes while one is on screen, drop the
 * snapshots and render again from live data. A second crash isn't the cache's
 * fault and gets a reload button instead of a white screen.
 */
class SnapshotErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { attempt: number; crashed: boolean; failed: boolean }
> {
  state = { attempt: 0, crashed: false, failed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    if (recoverFromSnapshotError()) {
      this.setState((s) => ({ attempt: s.attempt + 1, crashed: false }));
    } else {
      console.error(error);
      this.setState({ failed: true });
    }
  }

  render() {
    if (this.state.crashed && !this.state.failed) return null;
    if (this.state.failed) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm text-white/60">Something went wrong.</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-nothing-purple px-5 py-2 text-sm font-medium text-white"
          >
            Reload
          </button>
        </div>
      );
    }
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

/**
 * Warms the data for the main screens once the app has settled, so even the
 * first visit to one opens with live data instead of loading. They then stay
 * subscribed for a while (see KEEP_ALIVE_MS), which is cheap for an app with
 * two users.
 */
function usePrefetchScreens() {
  const client = useConvex();
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated) return;
    const run = () => {
      prefetchQuery(client, api.messages.list, { limit: CHAT_PAGE });
      prefetchQuery(client, api.memories.list);
      prefetchQuery(client, api.expenses.list);
      prefetchQuery(client, api.expenses.balance);
      prefetchQuery(client, api.expenses.settlements);
      prefetchQuery(client, api.recurring.list);
      prefetchQuery(client, api.tracking.feed, {});
      prefetchQuery(client, api.tracking.list);
      prefetchQuery(client, api.tracking.stats);
      prefetchQuery(client, api.notifications.list);
      prefetchQuery(client, api.goals.list);
      prefetchQuery(client, api.capsules.list);
      prefetchQuery(client, api.insights.list);
      prefetchQuery(client, api.fights.list);
      prefetchQuery(client, api.liveLocations.both);
      prefetchQuery(client, api.settings.get);
      prefetchQuery(client, api.users.partner);
      // Screen code too, so the first tap on a tab never waits on a download.
      // A failed preload is harmless: React.lazy retries on the actual visit.
      for (const screen of PRELOAD) screen.preload().catch(() => {});
    };
    // After the current screen's own queries, not competing with them.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [client, isAuthenticated]);
}

const HEALTH_TABS = {"HealthHome":"health","HealthRecords":"health-records","HealthLabs":"health-labs","HealthVitals":"health-vitals","HealthMeds":"health-meds","HealthVisits":"health-visits","HealthPrevention":"health-prevention","HealthSymptoms":"health-symptoms","HealthCare":"health-care","HealthMedId":"health-medid","HealthHistory":"health-history","HealthCycle":"health-cycle","HealthMind":"health-mind","HealthInsurance":"health-insurance","HealthShare":"health-share","HealthSettings":"health-settings"} as const;

const VALID_TABS = new Set<string>([
  'home', 'track', 'chat', 'call', 'memories', 'timeline', 'goals', 'capsules', 'insights',
  'analyzer', 'fights', 'map', 'stats', 'split', 'logs', 'notifications', 'settings', 'mini',
  ...Object.values(HEALTH_TABS),
]);

/**
 * The active tab lives in the URL hash AND in storage, so a refresh, a
 * pull-to-refresh, an OTA reload and even a cold start (the OS killed the app)
 * all land back on the same screen instead of Home. Each change is a real
 * history entry, so Back returns to the screen you came from (see
 * lib/navigation.ts and lib/backButtonStack.ts).
 */
type SetTab = (tab: string, opts?: { replace?: boolean }) => void;

function useHashTab(): [string, SetTab] {
  const [activeTab, setTab] = useState(() => initialTab(VALID_TABS));
  const tabRef = useRef(activeTab);
  tabRef.current = activeTab;

  useEffect(() => {
    const onPop = () => {
      const next = tabFromHash(VALID_TABS) ?? 'home';
      // Landing on another screen via Back: return to where it was scrolled.
      if (next !== tabRef.current) markHistoryLanding();
      setTab(next);
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  useEffect(() => rememberTab(activeTab), [activeTab]);

  const setActiveTab = useCallback<SetTab>((tab, opts) => {
    const next = VALID_TABS.has(tab) ? tab : 'home';
    setTab(next);
    if ((tabFromHash(VALID_TABS) ?? 'home') === next) return;
    if (opts?.replace) replaceTab(next);
    else pushTab(next);
  }, []);

  // Lets screens link elsewhere without owning navigation state.
  useEffect(() => onGoToTab((tab) => setActiveTab(tab)), [setActiveTab]);

  return [activeTab, setActiveTab];
}

/**
 * Delivery receipts. The sender's bubble turns "delivered" once this device,
 * wherever you are in the app, has received the message; "seen" is set by the
 * chat screen itself.
 */
function ChatReceipts() {
  const pending = useQuery(api.messages.hasUndelivered);
  const markDelivered = useMutation(api.messages.markDelivered);
  useEffect(() => {
    if (pending) void markDelivered();
  }, [pending, markDelivered]);
  return null;
}

function AuthenticatedApp() {
  const currentUser = useQuery(api.users.current);
  const [activeTab, setActiveTab] = useHashTab();
  usePrefetchScreens();

  // NotificationProvider needs to drive navigation (a tapped notification has
  // to land on the right screen), so it wraps the shell rather than sitting
  // inside it.
  if (currentUser === undefined) return <Splash />;

  if (!currentUser?.name) {
    return <NameSetup />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Dashboard key="home" onNavigate={setActiveTab} />;
      case 'track':
        // Replace, not push: Back after saving shouldn't reopen the empty form.
        return <TrackingForm key="track" onSuccess={() => setActiveTab('home', { replace: true })} />;
      case 'chat':
        return <ChatView key="chat" />;
      case 'call':
        return <CallView key="call" />;
      case 'memories':
        return <MemoryBoard key="memories" />;
      case 'timeline':
        return <TimelineView key="timeline" />;
      case 'goals':
        return <GoalsView key="goals" />;
      case 'capsules':
        return <CapsulesView key="capsules" />;
      case 'insights':
        return <InsightsView key="insights" />;
      case 'analyzer':
        return <RelationshipAnalyzerView key="analyzer" />;
      case 'fights':
        return <FightLogView key="fights" />;
      case 'map':
        return <MapView key="map" />;
      case 'stats':
        return <StatsView key="stats" />;
      case 'split':
        return <SplitView key="split" />;
      case 'logs':
        return <LogsView key="logs" />;
      case 'notifications':
        return <NotificationsView key="notifications" onNavigate={setActiveTab} />;
      case 'mini':
        return <MiniWorldView key="mini" />;
      case 'settings':
        return <SettingsView key="settings" />;
      case 'health':
        return <HealthHome key="health" />;
      case 'health-records':
        return <HealthRecords key="health-records" />;
      case 'health-labs':
        return <HealthLabs key="health-labs" />;
      case 'health-vitals':
        return <HealthVitals key="health-vitals" />;
      case 'health-meds':
        return <HealthMeds key="health-meds" />;
      case 'health-visits':
        return <HealthVisits key="health-visits" />;
      case 'health-prevention':
        return <HealthPrevention key="health-prevention" />;
      case 'health-symptoms':
        return <HealthSymptoms key="health-symptoms" />;
      case 'health-care':
        return <HealthCare key="health-care" />;
      case 'health-medid':
        return <HealthMedId key="health-medid" />;
      case 'health-history':
        return <HealthHistory key="health-history" />;
      case 'health-cycle':
        return <HealthCycle key="health-cycle" />;
      case 'health-mind':
        return <HealthMind key="health-mind" />;
      case 'health-insurance':
        return <HealthInsurance key="health-insurance" />;
      case 'health-share':
        return <HealthShare key="health-share" />;
      case 'health-settings':
        return <HealthSettings key="health-settings" />;
      default:
        return <Dashboard key="home" onNavigate={setActiveTab} />;
    }
  };

  return (
    <NotificationProvider onNavigate={setActiveTab}>
      <ChatReceipts />
      <Suspense fallback={null}>
        <HealthBridge />
      </Suspense>
      <AppShell activeTab={activeTab} setActiveTab={setActiveTab}>
        {/* Screens are code-split (see lazyScreen). Normally already
            preloaded, so this fallback only shows on a cold deep link. */}
        <Suspense fallback={<ScreenLoading />}>{renderContent()}</Suspense>
      </AppShell>
    </NotificationProvider>
  );
}

function AppShell({
  activeTab,
  setActiveTab,
  children,
}: {
  activeTab: string;
  setActiveTab: SetTab;
  children: React.ReactNode;
}) {
  const { markTabRead } = useNotifications();

  // Looking at a screen is what clears its badge.
  useEffect(() => {
    markTabRead(activeTab);
  }, [activeTab, markTabRead]);

  // A new screen starts at the top; one you return to with Back reopens where
  // you left it. A layout effect, so it runs before the new screen's own
  // effects (Chat jumping to its newest message) rather than undoing them.
  useLayoutEffect(() => {
    restoreScroll(takeRestoreTarget());
  }, [activeTab]);

  // Any open modal/sheet gets first refusal (see useBackHandler call sites);
  // otherwise back goes to the previous screen, and minimizes rather than
  // exiting on Home.
  useAndroidBackButton(
    activeTab === 'home',
    useCallback(() => setActiveTab('home', { replace: true }), [setActiveTab]),
  );

  return (
    <div
      className="min-h-dvh max-w-4xl mx-auto px-4 sm:px-6"
      style={{ paddingTop: 'max(1.75rem, calc(env(safe-area-inset-top) + 1rem))' }}
    >
      {/* No exit animation: the old screen used to fade out completely
          (0.3s) before the new one started fading in (another 0.3s), so
          every tab tap felt slow. Now the new screen is there at once and
          just settles in. */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ opacity: { duration: 0.15 }, y: { type: 'spring', stiffness: 500, damping: 40 } }}
      >
        {children}
      </motion.div>
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
