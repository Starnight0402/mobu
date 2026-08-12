import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export const Avatar: React.FC<{ name?: string | null; avatarUrl?: string | null; size?: number; className?: string }> = ({
  name,
  avatarUrl,
  size = 36,
  className = '',
}) => (
  <div
    className={`shrink-0 rounded-full bg-nothing-purple/15 border border-nothing-purple/30 flex items-center justify-center overflow-hidden ${className}`}
    style={{ width: size, height: size }}
  >
    {avatarUrl ? (
      <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
    ) : (
      <span className="font-medium text-nothing-purple" style={{ fontSize: size / 2.6 }}>
        {(name || '').trim().charAt(0).toUpperCase() || '?'}
      </span>
    )}
  </div>
);

/**
 * The two-of-you cluster shown in view headers so both partners' faces stay
 * visible across the app, not just in Settings and calls.
 */
export const CoupleAvatars: React.FC<{ size?: number; className?: string }> = ({ size = 30, className = '' }) => {
  const me = useQuery(api.users.current);
  const partner = useQuery(api.users.partner);

  if (!me) return null;

  return (
    <div className={`flex items-center ${className}`} title={partner ? `You & ${partner.name}` : 'You'}>
      <Avatar name={me.name} avatarUrl={me.avatarUrl} size={size} className="ring-2 ring-black" />
      {partner && (
        <Avatar name={partner.name} avatarUrl={partner.avatarUrl} size={size} className="-ml-2.5 ring-2 ring-black" />
      )}
    </div>
  );
};
