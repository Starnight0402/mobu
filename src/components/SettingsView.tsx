import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { motion } from 'motion/react';
import { Globe, DollarSign, Save, LogOut, User, Moon, Sun, Download, Smartphone } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { AppSettings } from '../types';
import { useTheme } from '../hooks/useTheme';

export const SettingsView: React.FC = () => {
  const remoteSettings = useQuery(api.settings.get);
  const saveSettings = useMutation(api.settings.save);
  const currentUser = useQuery(api.users.current);
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
            <div className="w-10 h-10 rounded-full bg-nothing-purple/10 border border-nothing-purple/20 flex items-center justify-center">
              <User size={16} className="text-nothing-purple" />
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
