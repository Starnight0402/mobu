import React, { useState, useEffect } from 'react';
import { Goal } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Utensils, Plane, Dumbbell, Coffee, Compass, Star, Plus, X, Check } from 'lucide-react';

export const GoalsView: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('adventure');
  const [newTarget, setNewTarget] = useState('5');

  const fetchGoals = () => {
    fetch('/api/goals').then(res => res.json()).then(setGoals);
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const getIcon = (category: string) => {
    switch (category) {
      case 'cooking': return <Utensils size={20} />;
      case 'travel': return <Plane size={20} />;
      case 'fitness': return <Dumbbell size={20} />;
      case 'relaxation': return <Coffee size={20} />;
      case 'adventure': return <Compass size={20} />;
      default: return <Star size={20} />;
    }
  };

  const incrementGoal = async (goal: Goal) => {
    if (goal.current >= goal.target) return;
    
    // Optimistic update
    setGoals(goals.map(g => g.id === goal.id ? { ...g, current: g.current + 1 } : g));
    
    await fetch(`/api/goals/${goal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: goal.current + 1 })
    });
  };

  const addGoal = async () => {
    if (!newTitle || !newTarget) return;
    
    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle,
        category: newCategory,
        target: parseInt(newTarget, 10),
        current: 0
      })
    });
    
    setIsAdding(false);
    setNewTitle('');
    setNewTarget('5');
    fetchGoals();
  };

  return (
    <div className="space-y-12 pb-32">
      <header className="flex justify-between items-end">
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-medium tracking-tight dot-matrix">Shared Goals</h1>
          <p className="text-white/40 text-sm uppercase tracking-widest">Growing together</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all shadow-xl"
        >
          <Plus size={20} />
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {goals.map((goal, i) => (
          <motion.div 
            key={goal.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass p-8 space-y-6 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-8 text-white/5 group-hover:text-nothing-purple/10 transition-colors">
              {getIcon(goal.category)}
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-medium tracking-tight pr-12">{goal.title}</h3>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{goal.category}</p>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-3xl font-mono font-light">
                  {goal.current} <span className="text-sm text-white/20">/ {goal.target}</span>
                </span>
                <span className="text-[10px] font-mono text-nothing-purple">
                  {Math.round((goal.current / goal.target) * 100)}%
                </span>
              </div>
              
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(goal.current / goal.target) * 100}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className="h-full bg-nothing-purple shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                />
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                {[...Array(goal.target)].map((_, idx) => (
                  <div 
                    key={idx}
                    className={`w-2 h-2 rounded-full border ${
                      idx < goal.current ? 'bg-nothing-purple border-nothing-purple' : 'border-white/10'
                    }`}
                  />
                ))}
              </div>
              
              {goal.current < goal.target ? (
                <button 
                  onClick={() => incrementGoal(goal)}
                  className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 hover:border-white/40 transition-all active:scale-95"
                >
                  <Plus size={14} />
                </button>
              ) : (
                <div className="w-8 h-8 rounded-full bg-nothing-purple/20 text-nothing-purple flex items-center justify-center">
                  <Check size={14} />
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Goal Modal */}
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
                <h3 className="dot-matrix text-xl">New Goal</h3>
                <button onClick={() => setIsAdding(false)} className="text-white/40 hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="Goal Title" 
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="nothing-input w-full"
                />
                <div className="grid grid-cols-2 gap-4">
                  <select 
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="nothing-input w-full appearance-none bg-black/50"
                  >
                    <option value="adventure">Adventure</option>
                    <option value="cooking">Cooking</option>
                    <option value="fitness">Fitness</option>
                    <option value="travel">Travel</option>
                    <option value="relaxation">Relaxation</option>
                  </select>
                  <input 
                    type="number" 
                    placeholder="Target" 
                    value={newTarget}
                    onChange={e => setNewTarget(e.target.value)}
                    className="nothing-input w-full"
                    min="1"
                  />
                </div>
                <button 
                  onClick={addGoal}
                  className="w-full py-4 bg-nothing-purple text-white rounded-2xl font-medium uppercase tracking-widest text-xs"
                >
                  Create Goal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
