import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Capsule } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Unlock, Mail, Image as ImageIcon, Mic, Video, X, Plus } from 'lucide-react';

const CAPSULE_TYPES = ['letter', 'photos', 'voice', 'video'] as const;

export const CapsulesView: React.FC = () => {
  const capsules = useQuery(api.capsules.list) ?? [];
  const createCapsule = useMutation(api.capsules.create);

  const [selectedCapsule, setSelectedCapsule] = useState<Capsule | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<typeof CAPSULE_TYPES[number]>('letter');
  const [newDate, setNewDate] = useState('');

  const getIcon = (type: string) => {
    switch (type) {
      case 'letter': return <Mail size={20} />;
      case 'photos': return <ImageIcon size={20} />;
      case 'voice': return <Mic size={20} />;
      case 'video': return <Video size={20} />;
      default: return <Lock size={20} />;
    }
  };

  const addCapsule = async () => {
    if (!newTitle || !newDate) return;

    await createCapsule({
      title: newTitle,
      type: newType,
      unlockDate: newDate,
    });

    setIsAdding(false);
    setNewTitle('');
    setNewDate('');
  };

  return (
    <div className="space-y-12 pb-32">
      <header className="flex justify-between items-end">
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-medium tracking-tight dot-matrix">Memory Capsules</h1>
          <p className="text-white/40 text-sm uppercase tracking-widest">Locked moments for the future</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all shadow-xl"
        >
          <Plus size={20} />
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {capsules.map((capsule, i) => {
          const unlockDate = new Date(capsule.unlockDate);
          const isLocked = unlockDate > new Date();

          return (
            <motion.div
              key={capsule._id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => !isLocked && setSelectedCapsule(capsule)}
              className={`glass p-8 space-y-8 relative overflow-hidden group cursor-pointer transition-all ${
                isLocked ? 'grayscale opacity-60' : 'hover:border-nothing-purple'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-2xl bg-white/5 text-nothing-purple">
                  {getIcon(capsule.type)}
                </div>
                {isLocked ? <Lock size={16} className="text-white/20" /> : <Unlock size={16} className="text-nothing-purple" />}
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-medium tracking-tight">{capsule.title}</h3>
                <p className="text-[10px] uppercase tracking-widest text-white/40">{capsule.type}</p>
              </div>

              <div className="pt-8 border-t border-white/5">
                <p className="text-[10px] uppercase tracking-widest text-white/20">Available on</p>
                <p className={`text-xs font-mono mt-1 ${isLocked ? 'text-white/40' : 'text-nothing-purple'}`}>
                  {unlockDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>

              {isLocked && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="text-center space-y-2">
                    <Lock size={24} className="mx-auto text-white/40" />
                    <p className="text-[10px] uppercase tracking-widest text-white/40">Locked</p>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedCapsule && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              onClick={() => setSelectedCapsule(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative glass p-12 w-full max-w-2xl space-y-8"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h3 className="text-3xl font-medium tracking-tight">{selectedCapsule.title}</h3>
                  <p className="text-[10px] uppercase tracking-widest text-nothing-purple">Unlocked Capsule</p>
                </div>
                <button onClick={() => setSelectedCapsule(null)} className="text-white/40 hover:text-white"><X size={24} /></button>
              </div>
              
              <div className="aspect-video rounded-3xl bg-white/5 flex items-center justify-center border border-white/10">
                <div className="text-center space-y-4">
                  <div className="p-6 rounded-full bg-nothing-purple/20 text-nothing-purple mx-auto w-fit">
                    {getIcon(selectedCapsule.type)}
                  </div>
                  <p className="text-sm text-white/40">Content would be displayed here</p>
                </div>
              </div>

              <p className="text-white/60 leading-relaxed">
                This memory was captured for you to open today. It represents a moment in time we wanted to preserve forever.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Capsule Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setIsAdding(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative glass p-8 w-full max-w-md space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="dot-matrix text-xl">New Capsule</h3>
                <button onClick={() => setIsAdding(false)} className="text-white/40 hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="Capsule Title" 
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="nothing-input w-full"
                />
                <div className="grid grid-cols-2 gap-4">
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as typeof CAPSULE_TYPES[number])}
                    className="nothing-input w-full appearance-none bg-black/50"
                  >
                    <option value="letter">Letter</option>
                    <option value="photos">Photos</option>
                    <option value="voice">Voice</option>
                    <option value="video">Video</option>
                  </select>
                  <input 
                    type="date" 
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="nothing-input w-full"
                  />
                </div>
                <button 
                  onClick={addCapsule}
                  className="w-full py-4 bg-nothing-purple text-white rounded-2xl font-medium uppercase tracking-widest text-xs"
                >
                  Lock Capsule
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
