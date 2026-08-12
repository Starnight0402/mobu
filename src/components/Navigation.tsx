import React, { useEffect, useState } from 'react';
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
  LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from './NotificationProvider';
import { haptic } from '../lib/haptics';

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
 * Twelve icons in a horizontally-scrolling pill meant every destination past
 * the fifth was invisible until you thought to swipe a nav bar. The five
 * things you reach for daily now live in the bar with visible labels; the
 * rest are one tap away in a sheet.
 */
const PRIMARY_TABS: TabDef[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'chat', icon: MessageCircle, label: 'Chat' },
  { id: 'call', icon: Phone, label: 'Call' },
  { id: 'memories', icon: ImageIcon, label: 'Board' },
];

const MORE_TABS: TabDef[] = [
  { id: 'notifications', icon: Bell, label: 'Alerts' },
  { id: 'track', icon: Plus, label: 'Track' },
  { id: 'logs', icon: ListChecks, label: 'Logs' },
  { id: 'split', icon: Scale, label: 'Split' },
  { id: 'timeline', icon: Clock, label: 'Timeline' },
  { id: 'map', icon: MapIcon, label: 'Map' },
  { id: 'insights', icon: Sparkles, label: 'Insights' },
  { id: 'goals', icon: Target, label: 'Goals' },
  { id: 'capsules', icon: Lock, label: 'Capsules' },
  { id: 'stats', icon: BarChart2, label: 'Stats' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const { unreadByTab } = useNotifications();

  const moreIsActive = MORE_TABS.some((t) => t.id === activeTab) && activeTab !== 'track';

  // Anything the bar doesn't badge directly rolls up onto the More button, so
  // no notification is invisible just because its screen is behind the sheet.
  const primaryIds = new Set(PRIMARY_TABS.map((t) => t.id));
  const moreUnread = Object.entries(unreadByTab)
    .filter(([tab]) => !primaryIds.has(tab))
    .reduce((sum, [, count]) => sum + count, 0);

  const go = (tab: string) => {
    haptic('select');
    setActiveTab(tab);
  };

  // Close the sheet whenever navigation happens from anywhere (a dashboard
  // card, a deep link) so it can't be left hanging over the new screen.
  useEffect(() => {
    setMoreOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 80 || info.velocity.y > 500) setMoreOpen(false);
              }}
              className="fixed bottom-0 left-0 right-0 z-[70] mx-auto w-full max-w-lg rounded-t-[2rem] border-t border-x border-white/10 bg-[#0b0b0b] px-5 pt-3"
              style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-white/40">All sections</h2>
                <button
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close menu"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/60 transition-colors hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 pb-2">
                {MORE_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  const count = unreadByTab[tab.id] ?? 0;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => go(tab.id)}
                      className={`relative flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-2xl border p-2 transition-all active:scale-95 ${
                        isActive
                          ? 'border-nothing-purple/40 bg-nothing-purple/15 text-white'
                          : 'border-white/5 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]'
                      }`}
                    >
                      {count > 0 && <Badge count={count} className="right-1.5 top-1.5" />}
                      <Icon size={20} />
                      <span className="text-[11px] tracking-wide">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Quick-log action, kept out of the bar so logging never costs two taps.
          Hidden on Chat — it sits at the same right-4 offset as the composer's
          send button and the two crowd each other right above the keyboard. */}
      {activeTab !== 'chat' && (
        <button
          onClick={() => go('track')}
          aria-label="Log an entry"
          className={`fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all active:scale-90 ${
            activeTab === 'track'
              ? 'bg-white text-black'
              : 'bg-nothing-purple text-white hover:brightness-110'
          }`}
          style={{ bottom: 'max(6rem, calc(env(safe-area-inset-bottom) + 5rem))' }}
        >
          <Plus size={24} />
        </button>
      )}

      <nav
        className="fixed left-0 right-0 z-50 px-3"
        style={{ bottom: 'max(0.75rem, calc(env(safe-area-inset-bottom) + 0.25rem))' }}
      >
        <div className="glass mx-auto flex max-w-md items-stretch justify-around gap-1 p-1.5 shadow-2xl">
          {PRIMARY_TABS.map((tab) => (
            <NavButton
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              count={unreadByTab[tab.id] ?? 0}
              onClick={() => go(tab.id)}
            />
          ))}
          <NavButton
            tab={{ id: 'more', icon: MoreHorizontal, label: 'More' }}
            isActive={moreIsActive || moreOpen}
            count={moreUnread}
            onClick={() => {
              haptic('select');
              setMoreOpen((v) => !v);
            }}
          />
        </div>
      </nav>
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
}> = ({ tab, isActive, count, onClick }) => {
  const Icon = tab.icon;
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      aria-label={count > 0 ? `${tab.label}, ${count} unread` : tab.label}
      /* min-h/min-w keep every target at or above the 44px touch minimum. */
      className={`relative flex min-h-[52px] min-w-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${
        isActive ? 'text-white' : 'text-white/40'
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="nav-glow"
          className="absolute inset-0 rounded-2xl bg-white/10"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        />
      )}
      {count > 0 && <Badge count={count} className="right-2 top-1" />}
      <Icon size={19} className="relative" />
      <span className="relative text-[10px] leading-none tracking-wide">{tab.label}</span>
    </button>
  );
};
