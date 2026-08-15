import React, { useCallback, useEffect, useState } from 'react';
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from 'convex/react';
import { Navigation } from './components/Navigation';
import { PullToRefresh } from './components/PullToRefresh';
import { useAndroidBackButton } from './lib/useAndroidBackButton';
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
import { ChatView } from './components/ChatView';
import { CallView } from './components/CallView';
import { SignInScreen } from './components/SignInScreen';
import { NameSetup } from './components/NameSetup';
import { LightboxProvider } from './components/Lightbox';
import { CallProvider } from './components/CallProvider';
import { NotificationProvider, useNotifications } from './components/NotificationProvider';
import { NotificationsView } from './components/NotificationsView';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../convex/_generated/api';

export default function App() {
  return (
    <PullToRefresh>
      <LightboxProvider>
        <AuthLoading>
          <div className="min-h-dvh flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-nothing-purple animate-pulse" />
          </div>
        </AuthLoading>
        <Unauthenticated>
          <SignInScreen />
        </Unauthenticated>
        {/* CallProvider lives above the tab switch so a call survives navigation
            and the incoming-call sheet can appear from any screen. */}
        <Authenticated>
          <CallProvider>
            <AuthenticatedApp />
          </CallProvider>
        </Authenticated>
      </LightboxProvider>
    </PullToRefresh>
  );
}

function AuthenticatedApp() {
  const currentUser = useQuery(api.users.current);
  const [activeTab, setActiveTab] = useState('home');

  // NotificationProvider needs to drive navigation (a tapped notification has
  // to land on the right screen), so it wraps the shell rather than sitting
  // inside it.
  if (currentUser === undefined) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-nothing-purple animate-pulse" />
      </div>
    );
  }

  if (!currentUser?.name) {
    return <NameSetup />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Dashboard key="home" onNavigate={setActiveTab} />;
      case 'track':
        return <TrackingForm key="track" onSuccess={() => setActiveTab('home')} />;
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
      case 'settings':
        return <SettingsView key="settings" />;
      default:
        return <Dashboard key="home" onNavigate={setActiveTab} />;
    }
  };

  return (
    <NotificationProvider onNavigate={setActiveTab}>
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
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
}) {
  const { markTabRead } = useNotifications();

  // Looking at a screen is what clears its badge.
  useEffect(() => {
    markTabRead(activeTab);
  }, [activeTab, markTabRead]);

  // Any open modal/sheet gets first refusal (see useBackHandler call sites);
  // otherwise back goes to Home, and minimizes rather than exiting once
  // already there.
  useAndroidBackButton(
    useCallback(() => {
      if (activeTab === 'home') return false;
      setActiveTab('home');
      return true;
    }, [activeTab, setActiveTab]),
  );

  return (
    <div
      className="min-h-dvh max-w-4xl mx-auto px-4 sm:px-6"
      style={{ paddingTop: 'max(1.75rem, calc(env(safe-area-inset-top) + 1rem))' }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
