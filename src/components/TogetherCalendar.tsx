import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Calendar as CalendarIcon, MapPin, Loader2 } from 'lucide-react';

interface TogetherCalendarProps {
  size: 'small' | 'wide' | 'tall' | 'large';
}

export const TogetherCalendar: React.FC<TogetherCalendarProps> = ({ size }) => {
  const [checkingIn, setCheckingIn] = useState(false);
  const checkIn = useMutation(api.tracking.checkIn);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const status = useQuery(api.tracking.togetherness, { year, month }) ?? {};

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const monthName = now.toLocaleString('default', { month: 'long' });
  const togetherCount = Object.values(status).filter((s) => s === 'together').length;

  const handleCheckIn = () => {
    if (!navigator.geolocation) return;
    setCheckingIn(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await checkIn({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCheckingIn(false);
      },
      () => setCheckingIn(false),
    );
  };

  const dotClass = (s: 'together' | 'apart' | 'none' | undefined) => {
    if (s === 'together') return 'bg-nothing-purple shadow-[0_0_4px_rgba(168,85,247,0.3)] group-hover/day:scale-125';
    if (s === 'apart') return 'bg-white/25 group-hover/day:bg-white/40';
    return 'bg-white/5 group-hover/day:bg-white/20';
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <CalendarIcon className="text-nothing-purple" size={18} />
        <div className="text-right">
          <span className="text-[8px] uppercase tracking-widest text-white/20 block">Togetherness</span>
          <span className="text-[10px] font-mono text-nothing-purple">{togetherCount}/{daysInMonth} Days</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-7 gap-1.5">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-[6px] text-center text-white/20 font-mono mb-1">
              {d}
            </div>
          ))}

          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isToday = day === now.getDate();
            const dayStatus = status[day];

            return (
              <div
                key={day}
                className="aspect-square flex items-center justify-center relative group/day"
                title={dayStatus === 'together' ? 'Together in person' : dayStatus === 'apart' ? 'Long distance' : undefined}
              >
                {isToday && (
                  <div className="absolute inset-0 border border-white/10 rounded-full scale-110" />
                )}
                <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${dotClass(dayStatus)}`} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
        <span className="text-[8px] uppercase tracking-widest text-white/40 font-mono">{monthName} {year}</span>
        <button
          onClick={handleCheckIn}
          disabled={checkingIn}
          title="Check in — marks today as together if your partner also checks in nearby"
          className="flex items-center gap-1 text-[8px] uppercase tracking-widest text-nothing-purple hover:text-white transition-colors disabled:opacity-50"
        >
          {checkingIn ? <Loader2 size={10} className="animate-spin" /> : <MapPin size={10} />}
          Check In
        </button>
      </div>
    </div>
  );
};
