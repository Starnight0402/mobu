import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { motion } from 'motion/react';
import { Star, Plane, Utensils, Image as ImageIcon, Calendar } from 'lucide-react';
import { Memory } from '../types';
import { useLightbox } from './Lightbox';

export const TimelineView: React.FC = () => {
  const memories = useQuery(api.memories.list) ?? [];
  const { openGallery } = useLightbox();

  const photos = memories
    .filter((m) => !!m.imageUrl)
    .map((m) => ({
      src: m.imageUrl as string,
      alt: m.title,
      caption: m.title,
      subcaption: m.location ?? new Date(m._creationTime).toLocaleDateString(),
    }));

  const getIcon = (category: string) => {
    switch (category) {
      case 'milestone': return <Star size={16} />;
      case 'travel': return <Plane size={16} />;
      case 'food': return <Utensils size={16} />;
      case 'event': return <Calendar size={16} />;
      default: return <ImageIcon size={16} />;
    }
  };

  const groupedByYear = memories.reduce((acc, memory) => {
    const year = new Date(memory._creationTime).getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(memory);
    return acc;
  }, {} as Record<number, Memory[]>);

  const years = Object.keys(groupedByYear).sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <div className="space-y-12 pb-32">
      <header className="space-y-2">
        <h1 className="text-4xl font-display font-medium tracking-tight dot-matrix">Timeline</h1>
        <p className="text-white/40 text-sm uppercase tracking-widest">Our shared narrative</p>
      </header>

      <div className="relative border-l border-white/10 ml-4 pl-8 space-y-16">
        {years.map((year) => (
          <div key={year} className="space-y-8">
            <div className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-black border border-white/20 rounded-full">
              <div className="w-1.5 h-1.5 bg-nothing-purple rounded-full" />
            </div>
            <h2 className="text-2xl font-mono text-nothing-purple">{year}</h2>
            
            <div className="space-y-12">
              {groupedByYear[parseInt(year)].map((memory, i) => (
                <motion.div
                  key={memory._id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="relative group"
                >
                  <div className="absolute -left-[41px] top-1.5 w-4 h-4 rounded-full bg-black border border-white/20 flex items-center justify-center group-hover:border-nothing-purple transition-colors">
                    <div className="text-white/40 group-hover:text-nothing-purple">
                      {getIcon(memory.category || 'photo')}
                    </div>
                  </div>
                  
                  <div className="glass p-6 space-y-4 hover:border-white/20 transition-all cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-medium">{memory.title}</h3>
                        <p className="text-[10px] uppercase tracking-widest text-white/40 mt-1">
                          {new Date(memory._creationTime).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                      {memory.location && (
                        <span className="text-[10px] font-mono text-white/20">{memory.location}</span>
                      )}
                    </div>
                    {memory.imageUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          openGallery(photos, photos.findIndex((p) => p.src === memory.imageUrl))
                        }
                        className="block w-full aspect-video rounded-xl overflow-hidden"
                        aria-label={`View ${memory.title}`}
                      >
                        <img
                          src={memory.imageUrl}
                          alt={memory.title}
                          className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    )}
                    <p className="text-sm text-white/60 leading-relaxed">{memory.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
