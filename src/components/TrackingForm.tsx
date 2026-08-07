import React, { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion } from 'motion/react';
import { Wallet, Smile, Activity, Coffee, Heart, Send } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { TrackingType } from '../types';

export const TrackingForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const currentUser = useQuery(api.users.current);
  const [type, setType] = useState<TrackingType>('money');
  const [value, setValue] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [splitRatio, setSplitRatio] = useState('50'); // Default 50%
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const addTracking = useMutation(api.tracking.add);

  const types = [
    { id: 'money', icon: Wallet, label: 'Money' },
    { id: 'mood', icon: Smile, label: 'Mood' },
    { id: 'activity', icon: Activity, label: 'Activity' },
    { id: 'food', icon: Coffee, label: 'Food' },
    { id: 'health', icon: Heart, label: 'Health' },
  ];

  const moods = [
    { value: 10, emoji: '🤩', label: 'Amazing' },
    { value: 8, emoji: '😊', label: 'Good' },
    { value: 6, emoji: '😐', label: 'Okay' },
    { value: 4, emoji: '😔', label: 'Down' },
    { value: 2, emoji: '😫', label: 'Stressed' },
  ];

  const commonActivities = ['Movie Night', 'Dinner Date', 'Walk', 'Gaming', 'Gym', 'Shopping'];

  const handleTotalChange = (val: string) => {
    setTotalAmount(val);
    if (type === 'money' && val) {
      const calculated = (parseFloat(val) * (parseFloat(splitRatio) / 100)).toFixed(2);
      setValue(calculated);
    }
  };

  const handleSplitChange = (val: string) => {
    setSplitRatio(val);
    if (type === 'money' && totalAmount) {
      const calculated = (parseFloat(totalAmount) * (parseFloat(val) / 100)).toFixed(2);
      setValue(calculated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addTracking({
        type,
        value: type === 'mood' ? parseFloat(value) : (type === 'money' ? parseFloat(value) : 1),
        category: type === 'activity' ? category : (type === 'food' ? 'Meal' : (type === 'health' ? 'Status' : category)),
        note: type === 'money' ? `Total: ${totalAmount}, Split: ${splitRatio}% | ${note}` : note,
      });
      setValue('');
      setTotalAmount('');
      setCategory('');
      setNote('');
      onSuccess();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-32">
      <header className="space-y-1">
        <h1 className="text-4xl font-medium tracking-tight dot-matrix">Log Data</h1>
        <p className="text-white/40 text-[10px] uppercase tracking-widest">Sync life metrics</p>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setType(t.id as TrackingType);
              setValue('');
              setCategory('');
              setNote('');
            }}
            className={`px-4 py-2 rounded-full border transition-all whitespace-nowrap flex items-center gap-2 ${
              type === t.id ? 'bg-white text-black border-white' : 'bg-white/5 text-white/40 border-white/10'
            }`}
          >
            <t.icon size={14} />
            <span className="text-[10px] uppercase tracking-widest font-medium">{t.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="glass p-6 space-y-6">
        <div className="space-y-6">
          <p className="text-[8px] uppercase tracking-[0.2em] text-white/20 text-center">
            Logging as <span className="text-nothing-purple">{currentUser?.name}</span>
          </p>

          {/* Dynamic Inputs based on Type */}
          {type === 'money' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2">Total Amount</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={totalAmount}
                  onChange={(e) => handleTotalChange(e.target.value)}
                  placeholder="0.00"
                  className="nothing-input w-full text-3xl font-mono"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center ml-2">
                  <label className="text-[8px] uppercase tracking-widest text-white/20">Split: {splitRatio}% / {100 - parseInt(splitRatio)}%</label>
                  <span className="text-[8px] font-mono text-nothing-purple">Share: {value}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={splitRatio}
                  onChange={(e) => handleSplitChange(e.target.value)}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-nothing-purple"
                />
              </div>
            </div>
          )}

          {type === 'mood' && (
            <div className="space-y-3">
              <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2">Feeling?</label>
              <div className="grid grid-cols-5 gap-2">
                {moods.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setValue(m.value.toString())}
                    className={`flex flex-col items-center gap-1 p-3 rounded-2xl border transition-all ${
                      value === m.value.toString() ? 'bg-nothing-purple/20 border-nothing-purple' : 'border-white/5 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xl">{m.emoji}</span>
                    <span className="text-[6px] uppercase tracking-tighter text-white/40">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'activity' && (
            <div className="space-y-3">
              <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2">Activity?</label>
              <div className="flex flex-wrap gap-2">
                {commonActivities.map((act) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => setCategory(act)}
                    className={`px-3 py-1.5 rounded-full text-[8px] uppercase tracking-widest border transition-all ${
                      category === act ? 'bg-white text-black border-white' : 'border-white/10 text-white/40 hover:border-white/30'
                    }`}
                  >
                    {act}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Custom activity..."
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="nothing-input w-full text-sm"
              />
            </div>
          )}

          {type === 'food' && (
            <div className="space-y-1">
              <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2">Meal Details</label>
              <input
                type="text"
                required
                placeholder="e.g. Sushi Dinner..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="nothing-input w-full text-sm"
              />
            </div>
          )}

          {type === 'health' && (
            <div className="space-y-1">
              <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2">Health Status</label>
              <textarea
                required
                placeholder="How's your health today?..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="nothing-input w-full h-20 resize-none text-sm"
              />
            </div>
          )}

          {/* Generic fields for categories not handled above */}
          {type !== 'activity' && type !== 'food' && type !== 'health' && (
            <div className="space-y-1">
              <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2">Category</label>
              <input
                type="text"
                placeholder="e.g. Groceries, Travel..."
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="nothing-input w-full text-sm"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2">Notes</label>
            <textarea
              placeholder="Details..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="nothing-input w-full h-20 resize-none text-sm"
              disabled={type === 'food' || type === 'health'}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-nothing-purple text-white py-4 rounded-2xl font-medium uppercase tracking-[0.3em] text-[10px] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? 'Syncing...' : <><Send size={14} /> Log Entry</>}
        </button>
      </form>
    </div>
  );
};
