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
  Brain,
  Swords,
  Heart,
  Smile,
  LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from './NotificationProvider';
import { haptic } from '../lib/haptics';
import { useBackHandler } from '../lib/backButtonStack';

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

const ADD_ACTIONS: { id: string; label: string; hint: string; icon: LucideIcon; tab: string; composer?: boolean }[] = [
  { id: 'memory', label: 'Memory', hint: 'Photos, a trip, a moment', icon: ImageIcon, tab: 'memories', composer: true },
  { id: 'log', label: 'Mood or log', hint: 'How the day went', icon: Smile, tab: 'track' },
  { id: 'expense', label: 'Expense', hint: 'Split a bill', icon: Scale, tab: 'split' },
  { id: 'goal', label: 'Goal', hint: 'Something to do together', icon: Target, tab: 'goals' },
  { id: 'capsule', label: 'Time capsule', hint: 'A note for later', icon: Lock, tab: 'capsules' },
];

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { unreadByTab } = useNotifications();

  useBackHandler(moreOpen, () => setMoreOpen(false));
  useBackHandler(addOpen, () => setAddOpen(false));

  const moreIsActive = MORE_TABS.some((t) => t.id === activeTab);

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
              className="fixed bottom-0 left-0 right-0 z-[70] mx-auto w-full max-w-lg rounded-t-[2rem] border-t border-x border-white/10 bg-black px-5 pt-3"
              style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
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
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAddOpen(false)}
              className="fixed inset-0 z-[60] bg-black/70"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
              role="dialog"
              aria-label="Add something"
              className="fixed bottom-0 left-0 right-0 z-[70] mx-auto w-full max-w-lg rounded-t-[2rem] border-t border-x border-white/10 bg-black px-5 pt-3"
              style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
              <h2 className="mb-3 text-xl font-medium">Add something</h2>
              <div className="space-y-2">
                {ADD_ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        if (a.composer) {
                          try {
                            sessionStorage.setItem('mobu-open-composer', '1');
                          } catch {
                            // Without storage the user just lands on Memories and taps +.
                          }
                        }
                        go(a.tab);
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
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav
        className="fixed left-0 right-0 z-50 px-3"
        style={{ bottom: 'max(0.75rem, calc(env(safe-area-inset-bottom) + 0.25rem))' }}
      >
        <div className="glass mx-auto flex max-w-md items-stretch justify-around gap-1 p-1.5 shadow-2xl">
          {LEFT_TABS.map((tab) => (
            <NavButton
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              count={unreadByTab[tab.id] ?? 0}
              onClick={() => go(tab.id)}
            />
          ))}
          <div className="flex min-w-[64px] flex-1 items-center justify-center">
            <button
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
              isActive={activeTab === tab.id}
              count={unreadByTab[tab.id] ?? 0}
              onClick={() => go(tab.id)}
            />
          ))}
          <NavButton
            tab={{ id: 'us', icon: Heart, label: 'Us' }}
            isActive={moreIsActive || moreOpen}
            count={moreUnread}
            onClick={() => {
              haptic('select');
              setAddOpen(false);
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
