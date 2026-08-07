import React from 'react';
import { Map as MapIcon, Navigation, MapPin } from 'lucide-react';
import { motion } from 'motion/react';

export const MapView: React.FC = () => {
  const locations = [
    { id: 1, title: 'First Date', x: '40%', y: '30%', type: 'milestone' },
    { id: 2, title: 'Favorite Cafe', x: '60%', y: '50%', type: 'food' },
    { id: 3, title: 'Weekend Trip', x: '20%', y: '70%', type: 'travel' },
  ];

  return (
    <div className="space-y-12 pb-32">
      <header className="space-y-2">
        <h1 className="text-4xl font-display font-medium tracking-tight dot-matrix">Relationship Map</h1>
        <p className="text-white/40 text-sm uppercase tracking-widest">Our shared geography</p>
      </header>

      <div className="relative aspect-video rounded-[3rem] overflow-hidden border border-white/5 bg-[#050505] group">
        {/* Stylized Map Background (SVG) */}
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 1000 1000">
          <path d="M0 500 Q 250 400 500 500 T 1000 500" fill="none" stroke="white" strokeWidth="0.5" />
          <path d="M500 0 Q 400 250 500 500 T 500 1000" fill="none" stroke="white" strokeWidth="0.5" />
          <circle cx="500" cy="500" r="300" fill="none" stroke="white" strokeWidth="0.2" strokeDasharray="10 10" />
        </svg>

        {/* Location Markers */}
        {locations.map((loc) => (
          <motion.div
            key={loc.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: loc.id * 0.2 }}
            style={{ left: loc.x, top: loc.y }}
            className="absolute -translate-x-1/2 -translate-y-1/2 group/pin"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-nothing-purple/40 blur-xl rounded-full scale-150 animate-pulse" />
              <div className="relative glass p-2 rounded-full border-nothing-purple/50 text-nothing-purple">
                <MapPin size={16} />
              </div>
              
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover/pin:opacity-100 transition-opacity whitespace-nowrap">
                <div className="glass-dark px-3 py-1 rounded-full border-white/10">
                  <p className="text-[10px] font-medium tracking-tight">{loc.title}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        <div className="absolute bottom-8 left-8 glass px-4 py-2 flex items-center gap-3">
          <Navigation size={14} className="text-nothing-purple" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">3 Locations Discovered</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-6 space-y-2">
          <p className="text-2xl font-mono">12</p>
          <p className="text-[8px] uppercase tracking-widest text-white/20">Cafes Visited</p>
        </div>
        <div className="glass p-6 space-y-2">
          <p className="text-2xl font-mono">4</p>
          <p className="text-[8px] uppercase tracking-widest text-white/20">Cities Explored</p>
        </div>
        <div className="glass p-6 space-y-2">
          <p className="text-2xl font-mono">1560</p>
          <p className="text-[8px] uppercase tracking-widest text-white/20">Miles Traveled</p>
        </div>
      </div>
    </div>
  );
};
