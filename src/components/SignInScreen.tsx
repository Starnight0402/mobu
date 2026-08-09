import React, { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { ConvexError } from 'convex/values';
import { motion } from 'motion/react';
import { Lock, Mail, KeyRound } from 'lucide-react';

function errorMessage(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === 'string') return err.data;
  return err instanceof Error ? err.message : 'Something went wrong';
}

export const SignInScreen: React.FC = () => {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn('password', { email: email.trim().toLowerCase(), password, flow });
    } catch (err) {
      const message = errorMessage(err);
      if (message.includes('not authorized') || message.includes('private')) {
        // The one case that reliably reaches us with its real text, since
        // it's thrown as a ConvexError (see convex/auth.ts).
        setError("This app is private — that email isn't authorized.");
      } else if (message.includes('InvalidAccountId') || message.includes('Invalid credentials') || message.includes('InvalidSecret')) {
        setError('Wrong email or password.');
      } else if (message.includes('already') || message.includes('exists')) {
        setError('An account with that email already exists — try signing in instead.');
      } else if (flow === 'signIn') {
        // Everything else the auth library throws internally (InvalidSecret,
        // InvalidAccountId, ...) gets redacted to a generic message by
        // Convex on production deployments, so this is the best guess for
        // whatever's left: on sign-in, it's almost always a typo'd password.
        setError('Wrong email or password.');
      } else {
        setError('Something went wrong creating that account. If you already have one, try Sign In instead.');
      }
    } finally {
      setLoading(false);
    }
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
            <Lock className="text-nothing-purple" size={24} />
          </div>
          <h1 className="text-3xl font-display font-medium tracking-tight dot-matrix">Mobu</h1>
          <p className="text-white/40 text-[10px] uppercase tracking-widest">
            {flow === 'signIn' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass p-6 space-y-5">
          <div className="space-y-1">
            <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2 flex items-center gap-1">
              <Mail size={10} /> Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="nothing-input w-full text-sm"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2 flex items-center gap-1">
              <KeyRound size={10} /> Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="nothing-input w-full text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-nothing-purple text-white py-4 rounded-2xl font-medium uppercase tracking-[0.3em] text-[10px] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Please wait…' : flow === 'signIn' ? 'Sign In' : 'Sign Up'}
          </button>

          <button
            type="button"
            onClick={() => {
              setFlow(flow === 'signIn' ? 'signUp' : 'signIn');
              setError(null);
            }}
            className="w-full text-center text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
          >
            {flow === 'signIn' ? "First time? Create an account" : 'Already have an account? Sign in'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
