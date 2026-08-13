import React, { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { ConvexError } from 'convex/values';
import { motion } from 'motion/react';
import { Lock, Mail, KeyRound, ShieldCheck } from 'lucide-react';

function errorMessage(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === 'string') return err.data;
  return err instanceof Error ? err.message : 'Something went wrong';
}

type Flow = 'signIn' | 'signUp' | 'forgotEmail' | 'forgotCode';

export const SignInScreen: React.FC = () => {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<Flow>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn('password', { email: email.trim().toLowerCase(), flow: 'reset' });
      setNotice(`Sent a reset code to ${email.trim()}.`);
      setFlow('forgotCode');
    } catch (err) {
      setError(errorMessage(err) || 'Could not send a reset code. Check the email and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn('password', {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        newPassword,
        flow: 'reset-verification',
      });
    } catch (err) {
      const message = errorMessage(err);
      setError(
        message.includes('Invalid code')
          ? 'That code is wrong or expired. Request a new one.'
          : 'Could not reset the password. Double-check the code and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const backToSignIn = () => {
    setFlow('signIn');
    setError(null);
    setNotice(null);
    setPassword('');
    setCode('');
    setNewPassword('');
  };

  const title =
    flow === 'signIn'
      ? 'Welcome back'
      : flow === 'signUp'
        ? 'Create your account'
        : flow === 'forgotEmail'
          ? 'Reset your password'
          : 'Enter your code';

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
          <p className="text-white/40 text-[10px] uppercase tracking-widest">{title}</p>
        </div>

        {(flow === 'signIn' || flow === 'signUp') && (
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
              <div className="flex items-center justify-between ml-2 mr-1">
                <label className="text-[8px] uppercase tracking-widest text-white/20 flex items-center gap-1">
                  <KeyRound size={10} /> Password
                </label>
                {flow === 'signIn' && (
                  <button
                    type="button"
                    onClick={() => {
                      setFlow('forgotEmail');
                      setError(null);
                      setNotice(null);
                    }}
                    className="text-[8px] uppercase tracking-widest text-white/30 hover:text-nothing-purple transition-colors"
                  >
                    Forgot?
                  </button>
                )}
              </div>
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
        )}

        {flow === 'forgotEmail' && (
          <form onSubmit={handleRequestCode} className="glass p-6 space-y-5">
            <p className="text-xs text-white/40 leading-relaxed">
              Enter your account email and we'll send a reset code.
            </p>
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
              {loading ? 'Sending…' : 'Send Reset Code'}
            </button>

            <button
              type="button"
              onClick={backToSignIn}
              className="w-full text-center text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
            >
              Back to sign in
            </button>
          </form>
        )}

        {flow === 'forgotCode' && (
          <form onSubmit={handleResetPassword} className="glass p-6 space-y-5">
            {notice && (
              <p className="text-xs text-nothing-purple bg-nothing-purple/10 border border-nothing-purple/20 rounded-xl px-3 py-2">
                {notice}
              </p>
            )}
            <div className="space-y-1">
              <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2 flex items-center gap-1">
                <ShieldCheck size={10} /> Reset Code
              </label>
              <input
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="nothing-input w-full text-sm tracking-[0.3em]"
                placeholder="00000000"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] uppercase tracking-widest text-white/20 ml-2 flex items-center gap-1">
                <KeyRound size={10} /> New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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
              {loading ? 'Resetting…' : 'Reset Password'}
            </button>

            <button
              type="button"
              onClick={() => {
                setFlow('forgotEmail');
                setError(null);
                setNotice(null);
              }}
              className="w-full text-center text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
            >
              Didn't get a code? Try again
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
};
