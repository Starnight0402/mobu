import React from 'react';
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
} from 'lucide-react';
import { motion } from 'motion/react';

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'chat', icon: MessageCircle, label: 'Chat' },
    { id: 'memories', icon: ImageIcon, label: 'Board' },
    { id: 'timeline', icon: Clock, label: 'Timeline' },
    { id: 'map', icon: MapIcon, label: 'Map' },
    { id: 'track', icon: Plus, label: 'Track' },
    { id: 'insights', icon: Sparkles, label: 'Insights' },
    { id: 'goals', icon: Target, label: 'Goals' },
    { id: 'capsules', icon: Lock, label: 'Capsules' },
    { id: 'stats', icon: BarChart2, label: 'Stats' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <nav
      className="fixed left-1/2 -translate-x-1/2 z-50 w-full max-w-fit px-4"
      style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
    >
      <div className="glass px-2 py-2 flex items-center gap-1 shadow-2xl overflow-x-auto no-scrollbar max-w-[95vw]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative p-3 rounded-2xl transition-all flex-shrink-0 ${
                isActive ? 'text-white' : 'text-white/30 hover:text-white/50'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-glow"
                  className="absolute inset-0 bg-white/10 rounded-2xl"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon size={18} />
              {isActive && (
                <motion.div
                  layoutId="nav-dot"
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0.5 h-0.5 bg-nothing-purple rounded-full shadow-[0_0_4px_rgba(168,85,247,0.8)]"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
