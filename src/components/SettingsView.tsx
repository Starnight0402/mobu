import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { motion } from 'motion/react';
import { Globe, DollarSign, Save, LogOut, User, Moon, Sun, Download, Smartphone, Bell, Vibrate, Camera, X, Loader2 } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { AppSettings } from '../types';
import { useTheme } from '../hooks/useTheme';
import { useNotifications } from './NotificationProvider';
import { haptic, hapticsEnabled, hapticsSupported, setHapticsEnabled } from '../lib/haptics';
import { compressImage } from '../lib/image';

export const SettingsView: React.FC = () => {
  const remoteSettings = useQuery(api.settings.get);
  const saveSettings = useMutation(api.settings.save);
  const currentUser = useQuery(api.users.current);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const setAvatar = useMutation(api.users.setAvatar);
  const removeAvatar = useMutation(api.users.removeAvatar);
  const { signOut } = useAuthActions();
  const { theme, toggleTheme } = useTheme();
  const convex = useConvex();
  const [settings, setSettings] = useState<Omit<AppSettings, 'theme'>>({
    currency: 'USD',
    timezone: 'UTC',
    partnerPhone: '',
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    try {
      // Small and square-ish — a profile picture never needs to be more
      // than a few hundred px across, so compress much harder than a memory photo.
      const blob = await compressImage(file, 512, 0.8, 150 * 1024);
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      const { storageId } = await res.json();
      await setAvatar({ storageId });
      haptic('success');
    } catch (err) {
      console.error('Avatar upload failed', err);
    } finally {
      setAvatarUploading(false);
    }
  };

  const {
    permission,
    deviceRegistered,
    enable: enableNotifications,
    disable: disableNotifications,
  } = useNotifications();
  const [haptics, setHaptics] = useState(hapticsEnabled);
  const [pushError, setPushError] = useState<string | null>(null);
  const notificationsOn = permission === 'granted' && deviceRegistered;

  useEffect(() => {
    if (remoteSettings) {
      setSettings({
        currency: remoteSettings.currency,
        timezone: remoteSettings.timezone,
        partnerPhone: remoteSettings.partnerPhone ?? '',
      });
    }
  }, [remoteSettings]);

  const handleSave = async () => {
    setLoading(true);
    await saveSettings(settings);
    setLoading(false);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await convex.query(api.dataExport.all, {});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mobu-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8 pb-32">
      <header className="space-y-2">
        <h1 className="text-4xl font-medium tracking-tight dot-matrix">Settings</h1>
        <p className="text-white/40 text-sm uppercase tracking-widest">Configure your experience</p>
      </header>

      <div className="glass p-8 space-y-8">
        <div className="flex items-center justify-between pb-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="group relative w-14 h-14 rounded-full bg-nothing-purple/10 border border-nothing-purple/20 flex items-center justify-center overflow-hidden disabled:opacity-60"
                title="Change profile picture"
              >
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User size={20} className="text-nothing-purple" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  {avatarUploading ? (
                    <Loader2 size={16} className="text-white animate-spin" />
                  ) : (
                    <Camera size={16} className="text-white" />
                  )}
                </div>
              </button>
              {currentUser?.avatarUrl && !avatarUploading && (
                <button
                  type="button"
                  onClick={() => removeAvatar()}
                  title="Remove profile picture"
                  className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black border border-white/10 text-white/60 hover:text-red-400 hover:border-red-500/40 transition-colors"
                >
                  <X size={10} />
                </button>
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarPick}
                disabled={avatarUploading}
              />
            </div>
            <div>
              <p className="text-sm font-medium">{currentUser?.name}</p>
              <p className="text-[10px] text-white/40">{currentUser?.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>

        <div className="flex items-center justify-between pb-6 border-b border-white/5">
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/20">
            {theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />} Appearance
          </label>
          <button
            onClick={toggleTheme}
            className={`relative w-14 h-8 rounded-full border transition-colors ${
              theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-nothing-purple/20 border-nothing-purple/40'
            }`}
          >
            <motion.div
              layout
              className="absolute top-1 w-6 h-6 rounded-full bg-nothing-purple flex items-center justify-center"
              animate={{ left: theme === 'dark' ? 4 : 28 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
            >
              {theme === 'dark' ? <Moon size={12} className="text-white" /> : <Sun size={12} className="text-white" />}
            </motion.div>
          </button>
        </div>

        <div className="flex items-center justify-between pb-6 border-b border-white/5">
          <div className="flex-1 pr-4">
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/20">
              <Bell size={12} /> Notifications
            </label>
            <p className="mt-1 text-[10px] text-white/30">
              {permission === 'unsupported'
                ? 'Not supported in this browser'
                : notificationsOn
                  ? `On for this device${pushError ? '' : ''}`
                  : 'Off — calls and messages will not reach you when the app is closed'}
            </p>
            {pushError && <p className="mt-1 text-[10px] text-red-400">{pushError}</p>}
          </div>
          <Toggle
            on={notificationsOn}
            disabled={permission === 'unsupported'}
            onClick={async () => {
              setPushError(null);
              if (notificationsOn) {
                await disableNotifications();
              } else {
                const reason = await enableNotifications();
                if (reason) setPushError(reason);
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between pb-6 border-b border-white/5">
          <div className="flex-1 pr-4">
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/20">
              <Vibrate size={12} /> Haptics
            </label>
            <p className="mt-1 text-[10px] text-white/30">
              {hapticsSupported ? 'Vibration on taps, alerts and calls' : 'Not supported on this device'}
            </p>
          </div>
          <Toggle
            on={haptics}
            disabled={!hapticsSupported}
            onClick={() => {
              const next = !haptics;
              setHaptics(next);
              setHapticsEnabled(next);
              if (next) haptic('success');
            }}
          />
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/20 ml-2">
              <DollarSign size={12} /> Currency
            </label>
            <select
              value={settings.currency}
              onChange={e => setSettings({ ...settings, currency: e.target.value })}
              className="nothing-input w-full appearance-none cursor-pointer"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="INR">INR (₹)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/20 ml-2">
              <Globe size={12} /> Time Zone
            </label>
            <select
              value={settings.timezone}
              onChange={e => setSettings({ ...settings, timezone: e.target.value })}
              className="nothing-input w-full appearance-none cursor-pointer"
            >
              <option value="UTC">UTC</option>
              <option value="EST">EST (UTC-5)</option>
              <option value="PST">PST (UTC-8)</option>
              <option value="IST">IST (UTC+5:30)</option>
              <option value="GMT">GMT</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/20 ml-2">
              <Smartphone size={12} /> Partner's Phone
            </label>
            <input
              type="tel"
              inputMode="tel"
              placeholder="+91 98765 43210"
              value={settings.partnerPhone}
              onChange={e => setSettings({ ...settings, partnerPhone: e.target.value })}
              className="nothing-input w-full"
            />
            <p className="text-[10px] text-white/20 ml-2">
              Adds a one-tap dialer fallback on the Call screen for when the internet call struggles.
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-nothing-purple text-white py-4 rounded-2xl font-medium uppercase tracking-[0.3em] text-xs hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <Save size={16} /> {loading ? 'Saving...' : 'Save Changes'}
        </button>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full py-4 rounded-2xl font-medium uppercase tracking-[0.3em] text-xs border border-white/10 text-white/60 hover:border-white/30 hover:text-white transition-all flex items-center justify-center gap-2"
        >
          <Download size={16} /> {exporting ? 'Preparing…' : 'Download All Our Data'}
        </button>
      </div>
    </div>
  );
};

const Toggle: React.FC<{ on: boolean; disabled?: boolean; onClick: () => void }> = ({
  on,
  disabled = false,
  onClick,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    role="switch"
    aria-checked={on}
    className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors disabled:opacity-30 ${
      on ? 'border-nothing-purple/40 bg-nothing-purple/20' : 'border-white/10 bg-white/5'
    }`}
  >
    <motion.div
      layout
      className={`absolute top-1 h-6 w-6 rounded-full ${on ? 'bg-nothing-purple' : 'bg-white/30'}`}
      animate={{ left: on ? 28 : 4 }}
      transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
    />
  </button>
);
