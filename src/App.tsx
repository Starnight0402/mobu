import { useState } from 'react';
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from 'convex/react';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { TrackingForm } from './components/TrackingForm';
import { MemoryBoard } from './components/MemoryBoard';
import { StatsView } from './components/StatsView';
import { SettingsView } from './components/SettingsView';
import { TimelineView } from './components/TimelineView';
import { GoalsView } from './components/GoalsView';
import { CapsulesView } from './components/CapsulesView';
import { InsightsView } from './components/InsightsView';
import { MapView } from './components/MapView';
import { ChatView } from './components/ChatView';
import { CallView } from './components/CallView';
import { SignInScreen } from './components/SignInScreen';
import { NameSetup } from './components/NameSetup';
import { LightboxProvider } from './components/Lightbox';
import { CallProvider } from './components/CallProvider';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../convex/_generated/api';

export default function App() {
  return (
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
  );
}

function AuthenticatedApp() {
  const currentUser = useQuery(api.users.current);
  const [activeTab, setActiveTab] = useState('home');

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
        return <Dashboard key="home" />;
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
      case 'map':
        return <MapView key="map" />;
      case 'stats':
        return <StatsView key="stats" />;
      case 'settings':
        return <SettingsView key="settings" />;
      default:
        return <Dashboard key="home" />;
    }
  };

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
          {renderContent()}
        </motion.div>
      </AnimatePresence>
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
