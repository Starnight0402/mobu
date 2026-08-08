import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { motion } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { WidgetConfig, WidgetSize } from '../types';
import { TogetherCalendar } from './TogetherCalendar';
import {
  Wallet,
  Smile,
  Activity,
  Coffee,
  Image as ImageIcon,
  Sparkles,
  Lock,
  ChevronRight,
  Maximize2,
  Flame,
} from 'lucide-react';

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'calendar', size: 'small', order: 1 },
  { id: 'memories', size: 'wide', order: 2 },
  { id: 'insight', size: 'tall', order: 3 },
  { id: 'stats', size: 'small', order: 4 },
  { id: 'capsule', size: 'small', order: 5 },
  { id: 'activity', size: 'wide', order: 6 },
];

export const Dashboard: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false);

  const stats = useQuery(api.tracking.stats);
  const recent = useQuery(api.tracking.list) ?? [];
  const memories = useQuery(api.memories.list) ?? [];
  const insights = useQuery(api.insights.list) ?? [];
  const capsules = useQuery(api.capsules.list) ?? [];
  const streak = useQuery(api.tracking.streak);
  const onThisDay = useQuery(api.memories.onThisDay) ?? [];
  const settings = useQuery(api.settings.get) ?? { currency: 'USD', timezone: 'UTC' };
  const widgetsDoc = useQuery(api.widgets.list);
  const saveWidgets = useMutation(api.widgets.saveAll);

  const widgets: WidgetConfig[] =
    widgetsDoc && widgetsDoc.length > 0
      ? widgetsDoc.map((w) => ({ id: w.widgetId, size: w.size, order: w.order }))
      : DEFAULT_WIDGETS;

  const getCurrencySymbol = (code: string) => {
    const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };
    return symbols[code] || '$';
  };

  const cycleSize = (id: string) => {
    const sizes: WidgetSize[] = ['small', 'wide', 'tall', 'large'];
    const newWidgets = widgets.map((w) => {
      if (w.id === id) {
        const currentIndex = sizes.indexOf(w.size);
        const nextIndex = (currentIndex + 1) % sizes.length;
        return { ...w, size: sizes[nextIndex] };
      }
      return w;
    });
    saveWidgets({ widgets: newWidgets.map((w, i) => ({ id: w.id, size: w.size, order: i })) });
  };

  const getSizeClass = (size: WidgetSize) => {
    switch (size) {
      case 'small': return 'col-span-1 row-span-1';
      case 'wide': return 'col-span-2 row-span-1';
      case 'tall': return 'col-span-1 row-span-2';
      case 'large': return 'col-span-2 row-span-2';
      default: return 'col-span-1 row-span-1';
    }
  };

  const upcomingCapsule = capsules.find((c) => new Date(c.unlockDate) > new Date());

  const renderWidget = (widget: WidgetConfig) => {
    const commonProps = {
      layout: true,
      initial: { opacity: 0, scale: 0.9 },
      animate: { opacity: 1, scale: 1 },
      className: `glass p-6 relative group overflow-hidden ${getSizeClass(widget.size)}`,
    };

    const editOverlay = isEditing && (
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex items-center justify-center gap-2">
        <button
          onClick={() => cycleSize(widget.id)}
          className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
        >
          <Maximize2 size={20} />
        </button>
      </div>
    );

    switch (widget.id) {
      case 'calendar':
        return (
          <motion.div key="calendar" {...commonProps}>
            {editOverlay}
            <TogetherCalendar entries={recent} size={widget.size} />
          </motion.div>
        );
      case 'memories':
        return (
          <motion.div key="memories" {...commonProps}>
            {editOverlay}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="text-white/40" size={18} />
                <h3 className="text-[10px] uppercase tracking-widest font-medium">Memories</h3>
              </div>
              <span className="text-[8px] font-mono text-white/20">{stats?.totalMemories} Total</span>
            </div>
            <div className={`grid gap-2 ${widget.size === 'small' ? 'grid-cols-1' : widget.size === 'wide' ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {memories.slice(0, widget.size === 'small' ? 1 : widget.size === 'large' ? 4 : 3).map((memory) => (
                <div key={memory._id} className="aspect-square rounded-xl overflow-hidden glass border border-white/5">
                  <img
                    src={memory.imageUrl}
                    alt={memory.title}
                    className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ))}
            </div>
          </motion.div>
        );
      case 'insight':
        return (
          <motion.div key="insight" {...commonProps} className={`${commonProps.className} bg-nothing-purple/5 border-nothing-purple/20`}>
            {editOverlay}
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="text-nothing-purple" size={18} />
              <h3 className="text-[10px] uppercase tracking-widest font-medium">Insight</h3>
            </div>
            {insights.length > 0 ? (
              <div className="space-y-2">
                <p className={`${widget.size === 'small' ? 'text-sm' : 'text-lg'} font-medium leading-tight`}>{insights[0].title}</p>
                {widget.size !== 'small' && <p className="text-xs text-white/60 line-clamp-3">{insights[0].content}</p>}
              </div>
            ) : (
              <p className="text-xs text-white/40 italic">Analyzing patterns...</p>
            )}
          </motion.div>
        );
      case 'stats':
        return (
          <motion.div key="stats" {...commonProps}>
            {editOverlay}
            <div className="flex items-center gap-2 mb-4">
              <Smile className="text-white/40" size={18} />
              <h3 className="text-[10px] uppercase tracking-widest font-medium">Stats</h3>
            </div>
            <div className={`grid ${widget.size === 'wide' || widget.size === 'large' ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
              <div>
                <p className="text-xl font-mono">{(stats?.avgMood || 0).toFixed(1)}</p>
                <p className="text-[8px] uppercase tracking-widest text-white/20">Avg Mood</p>
              </div>
              <div>
                <p className="text-xl font-mono">
                  {getCurrencySymbol(settings.currency)}{(stats?.totalMoney ?? 0).toFixed(0)}
                </p>
                <p className="text-[8px] uppercase tracking-widest text-white/20">Spent</p>
              </div>
            </div>
          </motion.div>
        );
      case 'capsule':
        return (
          <motion.div key="capsule" {...commonProps}>
            {editOverlay}
            <div className="flex items-center gap-2 mb-4">
              <Lock className="text-white/40" size={18} />
              <h3 className="text-[10px] uppercase tracking-widest font-medium">Capsule</h3>
            </div>
            {upcomingCapsule ? (
              <div className="space-y-1">
                <p className="text-xs font-medium truncate">{upcomingCapsule.title}</p>
                <p className="text-[8px] font-mono text-nothing-purple">
                  {new Date(upcomingCapsule.unlockDate).toLocaleDateString()}
                </p>
              </div>
            ) : (
              <p className="text-xs text-white/40">None scheduled</p>
            )}
          </motion.div>
        );
      case 'activity':
        return (
          <motion.div key="activity" {...commonProps}>
            {editOverlay}
            <div className="flex items-center gap-2 mb-4">
              <Activity className="text-white/40" size={18} />
              <h3 className="text-[10px] uppercase tracking-widest font-medium">Activity</h3>
            </div>
            <div className="space-y-2">
              {recent.slice(0, widget.size === 'small' ? 1 : 2).map((entry) => (
                <div key={entry._id} className="flex items-center justify-between text-xs">
                  <span className="text-white/60 truncate mr-2">{entry.category || entry.type}</span>
                  <span className="font-mono text-white/40">{entry.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 pb-32">
      <header className="flex justify-between items-end">
        <div className="space-y-1">
          <h1 className="text-4xl font-display font-medium tracking-tight dot-matrix">Mobu</h1>
          <p className="text-white/40 text-[10px] uppercase tracking-widest">Intelligence Hub</p>
        </div>
        <div className="flex items-center gap-2">
          {!!streak?.days && (
            <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400" title="Consecutive days you've both logged something">
              <Flame size={12} />
              <span className="text-[10px] font-mono">{streak.days}</span>
            </div>
          )}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border transition-all ${
              isEditing ? 'bg-nothing-purple border-nothing-purple text-white' : 'border-white/10 text-white/40 hover:border-white/20'
            }`}
          >
            {isEditing ? 'Done' : 'Edit Layout'}
          </button>
        </div>
      </header>

      {onThisDay.length > 0 && (
        <section className="glass p-6 space-y-4 bg-nothing-purple/5 border-nothing-purple/20">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-nothing-purple" />
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/60">On This Day</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {onThisDay.map((m) => (
              <div key={m._id} className="flex-shrink-0 w-40 space-y-2">
                <div className="aspect-square rounded-xl overflow-hidden">
                  <img src={m.imageUrl} alt={m.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <p className="text-xs font-medium truncate">{m.title}</p>
                <p className="text-[9px] text-white/40">{new Date(m._creationTime).getFullYear()}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tetris Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 grid-flow-dense">
        {widgets.map(renderWidget)}
      </div>

      {/* Recent Activity List */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/40">Recent Activity</h2>
          <button className="text-[10px] uppercase tracking-widest text-white/20 hover:text-white/40 flex items-center gap-1">
            View All <ChevronRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recent.slice(0, 4).map((entry, i) => (
            <motion.div
              key={entry._id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-dark p-4 flex items-center justify-between group hover:bg-white/[0.02] transition-colors rounded-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-nothing-purple/10 transition-colors">
                  {entry.type === 'money' && <Wallet size={16} className="text-white/40 group-hover:text-nothing-purple" />}
                  {entry.type === 'mood' && <Smile size={16} className="text-white/40 group-hover:text-nothing-purple" />}
                  {entry.type === 'activity' && <Activity size={16} className="text-white/40 group-hover:text-nothing-purple" />}
                  {entry.type === 'food' && <Coffee size={16} className="text-white/40 group-hover:text-nothing-purple" />}
                </div>
                <div>
                  <p className="text-xs font-medium">{entry.category || entry.type}</p>
                  <p className="text-[8px] text-white/40 uppercase tracking-wider">{entry.user} • {new Date(entry._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-mono">
                  {entry.type === 'money' ? `-${getCurrencySymbol(settings.currency)}${entry.value}` : entry.value}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
};
