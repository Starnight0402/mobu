import { useState } from 'react';
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
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Dashboard key="home" />;
      case 'track':
        return <TrackingForm key="track" onSuccess={() => setActiveTab('home')} />;
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
    <div className="min-h-screen max-w-4xl mx-auto px-6 pt-12">
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
