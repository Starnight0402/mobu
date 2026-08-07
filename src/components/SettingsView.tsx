import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Globe, DollarSign, Save } from 'lucide-react';
import { AppSettings } from '../types';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({ currency: 'USD', timezone: 'UTC' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(setSettings);
  }, []);

  const handleSave = async () => {
    setLoading(true);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    setLoading(false);
  };

  return (
    <div className="space-y-8 pb-32">
      <header className="space-y-2">
        <h1 className="text-4xl font-medium tracking-tight dot-matrix">Settings</h1>
        <p className="text-white/40 text-sm uppercase tracking-widest">Configure your experience</p>
      </header>

      <div className="glass p-8 space-y-8">
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
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-nothing-purple text-white py-4 rounded-2xl font-medium uppercase tracking-[0.3em] text-xs hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <Save size={16} /> {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};
