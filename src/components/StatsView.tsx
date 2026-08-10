import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { motion } from 'motion/react';
import { currencySymbol } from '../lib/currency';

// Balances, settling and CSV export now live on the Split screen; this view is
// purely the charts.
export const StatsView: React.FC = () => {
  const stats = useQuery(api.tracking.stats);
  const history = useQuery(api.tracking.list) ?? [];
  const expenses = useQuery(api.expenses.list) ?? [];
  const settings = useQuery(api.settings.get);
  const currency = settings?.currency ?? 'USD';

  const moodData = history
    .filter(h => h.type === 'mood')
    .slice(-10)
    .reverse()
    .map(h => ({
      time: new Date(h._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: h.value
    }));

  const moneyData = expenses
    .slice(0, 10)
    .reverse()
    .map(e => ({
      time: new Date(e.spentAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      amount: e.amount
    }));

  return (
    <div className="space-y-8 pb-32">
      <header className="space-y-2">
        <h1 className="text-4xl font-medium tracking-tight dot-matrix">Analytics</h1>
        <p className="text-white/40 text-sm uppercase tracking-widest">Deep dive into your data</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-6 space-y-6"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-[10px] uppercase tracking-widest text-white/40">Mood Trends</h3>
            <span className="text-[10px] font-mono text-nothing-purple">LIVE</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={moodData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="time" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#666" fontSize={10} tickLine={false} axisLine={false} domain={[0, 10]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#a855f7" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#a855f7', strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass p-6 space-y-6"
        >
          <h3 className="text-[10px] uppercase tracking-widest text-white/40">Expense History</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={moneyData}>
                <defs>
                  <linearGradient id="colorMoney" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fff" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#fff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="time" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: number) => [`${currencySymbol(currency)}${value}`, 'Amount']}
                />
                <Area type="monotone" dataKey="amount" stroke="#fff" fillOpacity={1} fill="url(#colorMoney)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass p-6 space-y-6 md:col-span-2"
        >
          <h3 className="text-[10px] uppercase tracking-widest text-white/40">Activity Distribution</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.activities || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="category" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="count" fill="#a855f7" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
