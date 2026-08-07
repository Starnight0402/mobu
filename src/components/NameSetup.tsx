import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { motion } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { Heart } from 'lucide-react';

export const NameSetup: React.FC = () => {
  const setName = useMutation(api.users.setName);
  const [name, setNameInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await setName({ name: name.trim() });
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8"
      >
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-nothing-purple/10 border border-nothing-purple/20 flex items-center justify-center mx-auto mb-2">
            <Heart className="text-nothing-purple" size={24} />
          </div>
          <h1 className="text-2xl font-display font-medium tracking-tight dot-matrix">One Last Thing</h1>
          <p className="text-white/40 text-[10px] uppercase tracking-widest">What should we call you?</p>
        </div>

        <form onSubmit={handleSubmit} className="glass p-6 space-y-5">
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setNameInput(e.target.value)}
            className="nothing-input w-full text-sm text-center"
            placeholder="Your name"
          />
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full bg-nothing-purple text-white py-4 rounded-2xl font-medium uppercase tracking-[0.3em] text-[10px] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
