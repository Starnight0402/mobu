import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { motion } from 'motion/react';
import { Sparkles, TrendingUp, Zap, Lightbulb } from 'lucide-react';

export const InsightsView: React.FC = () => {
  const insights = useQuery(api.insights.list) ?? [];

  const getIcon = (type: string) => {
    switch (type) {
      case 'trend': return <TrendingUp size={20} />;
      case 'pattern': return <Zap size={20} />;
      case 'suggestion': return <Lightbulb size={20} />;
      default: return <Sparkles size={20} />;
    }
  };

  return (
    <div className="space-y-12 pb-32">
      <header className="space-y-2">
        <h1 className="text-4xl font-display font-medium tracking-tight dot-matrix">AI Insights</h1>
        <p className="text-white/40 text-sm uppercase tracking-widest">Relationship Intelligence</p>
      </header>

      <div className="space-y-6">
        {insights.map((insight, i) => (
          <motion.div
            key={insight._id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass p-8 flex gap-8 items-start group hover:border-nothing-purple/30 transition-all"
          >
            <div className="p-4 rounded-2xl bg-nothing-purple/10 text-nothing-purple group-hover:scale-110 transition-transform">
              {getIcon(insight.type)}
            </div>
            
            <div className="space-y-3 flex-1">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-medium tracking-tight">{insight.title}</h3>
                <span className="text-[10px] font-mono text-white/20">
                  {new Date(insight._creationTime).toLocaleDateString()}
                </span>
              </div>
              <p className="text-white/60 leading-relaxed">{insight.content}</p>
              <div className="pt-4 flex gap-4">
                <span className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full bg-white/5 text-white/40">
                  {insight.type}
                </span>
              </div>
            </div>
          </motion.div>
        ))}

        {insights.length === 0 && (
          <div className="glass p-12 text-center space-y-4">
            <Sparkles size={48} className="mx-auto text-white/10" />
            <p className="text-white/40 uppercase tracking-widest text-xs">Analyzing your data for patterns...</p>
          </div>
        )}
      </div>
    </div>
  );
};
