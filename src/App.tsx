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
import { TrackingForm } from './components/TrackingForm';
import { MemoryBoard } from './components/MemoryBoard';
import { StatsView } from './components/StatsView';
import { SplitView } from './components/SplitView';
import { LogsView } from './components/LogsView';
import { SettingsView } from './components/SettingsView';
import { TimelineView } from './components/TimelineView';
import { GoalsView } from './components/GoalsView';
import { CapsulesView } from './components/CapsulesView';
import { InsightsView } from './components/InsightsView';
import { RelationshipAnalyzerView } from './components/RelationshipAnalyzerView';
import { FightLogView } from './components/FightLogView';
import { MapView } from './components/MapView';
import { CHAT_PAGE, ChatView } from './components/ChatView';
import { CallView } from './components/CallView';
import { SignInScreen } from './components/SignInScreen';
import { NameSetup } from './components/NameSetup';
import { LightboxProvider } from './components/Lightbox';
import { CallProvider } from './components/CallProvider';
import { NotificationProvider, useNotifications } from './components/NotificationProvider';
import { NotificationsView } from './components/NotificationsView';
import { motion, MotionConfig } from 'motion/react';
import { api } from '../convex/_generated/api';

const MiniWorldView = React.lazy(() =>
  import('./components/mini/MiniWorldView').then((m) => ({ default: m.MiniWorldView })),
);

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

const VALID_TABS = new Set([
  'home', 'track', 'chat', 'call', 'memories', 'timeline', 'goals', 'capsules', 'insights',
  'analyzer', 'fights', 'map', 'stats', 'split', 'logs', 'notifications', 'settings', 'mini',
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
        return (
          <Suspense key="mini" fallback={null}>
            <MiniWorldView />
          </Suspense>
        );
      case 'settings':
        return <SettingsView key="settings" />;
      default:
        return <Dashboard key="home" onNavigate={setActiveTab} />;
    }
  };

  return (
    <NotificationProvider onNavigate={setActiveTab}>
      <ChatReceipts />
      <AppShell activeTab={activeTab} setActiveTab={setActiveTab}>
        {renderContent()}
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
