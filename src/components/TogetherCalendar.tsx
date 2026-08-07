import React from 'react';
import { TrackingEntry } from '../types';
import { Calendar as CalendarIcon } from 'lucide-react';

interface TogetherCalendarProps {
  entries: TrackingEntry[];
  size: 'small' | 'wide' | 'tall' | 'large';
}

export const TogetherCalendar: React.FC<TogetherCalendarProps> = ({ entries, size }) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  // Get days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  
  // Determine which days had activity
  const togetherDays = new Set<number>();
  entries.forEach(entry => {
    const d = new Date(entry.timestamp);
    if (d.getFullYear() === year && d.getMonth() === month) {
      togetherDays.add(d.getDate());
    }
  });

  const monthName = now.toLocaleString('default', { month: 'long' });

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <CalendarIcon className="text-nothing-purple" size={18} />
        <div className="text-right">
          <span className="text-[8px] uppercase tracking-widest text-white/20 block">Togetherness</span>
          <span className="text-[10px] font-mono text-nothing-purple">{togetherDays.size}/{daysInMonth} Days</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-7 gap-1.5">
          {/* Day labels */}
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-[6px] text-center text-white/20 font-mono mb-1">
              {d}
            </div>
          ))}
          
          {/* Empty spaces for first week */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          
          {/* Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isTogether = togetherDays.has(day);
            const isToday = day === now.getDate();
            
            return (
              <div 
                key={day} 
                className="aspect-square flex items-center justify-center relative group/day"
              >
                {isToday && (
                  <div className="absolute inset-0 border border-white/10 rounded-full scale-110" />
                )}
                <div 
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    isTogether 
                      ? 'bg-nothing-purple shadow-[0_0_4px_rgba(168,85,247,0.3)] group-hover/day:scale-125 group-hover/day:shadow-[0_0_8px_rgba(168,85,247,0.5)]' 
                      : 'bg-white/5 group-hover/day:bg-white/20'
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
        <span className="text-[8px] uppercase tracking-widest text-white/40 font-mono">{monthName} {year}</span>
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-nothing-purple" />
          <div className="w-1 h-1 rounded-full bg-white/5" />
          <div className="w-1 h-1 rounded-full bg-white/5" />
        </div>
      </div>
    </div>
  );
};
