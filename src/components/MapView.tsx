import React, { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { GoogleMap, MarkerF, InfoWindowF, useLoadScript } from '@react-google-maps/api';
import { Navigation, MapPin, KeyRound } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { Memory } from '../types';

// A standard dark map theme (in the spirit of Snazzy Maps' "Midnight
// Commander" family) so Google's tiles match the app's black/purple palette
// instead of the default light basemap.
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050505' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a4a4a' }] },
];

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export const MapView: React.FC = () => {
  const memories = useQuery(api.memories.list) ?? [];
  const pinned = useMemo(() => memories.filter((m) => m.lat != null && m.lng != null), [memories]);
  const distinctPlaces = useMemo(
    () => new Set(memories.filter((m) => m.location).map((m) => m.location)).size,
    [memories],
  );

  return (
    <div className="space-y-12 pb-32">
      <header className="space-y-2">
        <h1 className="text-4xl font-display font-medium tracking-tight dot-matrix">Relationship Map</h1>
        <p className="text-white/40 text-sm uppercase tracking-widest">Our shared geography</p>
      </header>

      <div className="relative aspect-video rounded-[3rem] overflow-hidden border border-white/5 bg-[#050505]">
        {GOOGLE_MAPS_API_KEY ? (
          <LiveMap memories={pinned} />
        ) : (
          <MissingKeyState />
        )}

        <div className="absolute bottom-8 left-8 glass px-4 py-2 flex items-center gap-3 z-10">
          <Navigation size={14} className="text-nothing-purple" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">
            {pinned.length} {pinned.length === 1 ? 'Location' : 'Locations'} Pinned
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass p-6 space-y-2">
          <p className="text-2xl font-mono">{distinctPlaces}</p>
          <p className="text-[8px] uppercase tracking-widest text-white/20">Places Named</p>
        </div>
        <div className="glass p-6 space-y-2">
          <p className="text-2xl font-mono">{pinned.length}</p>
          <p className="text-[8px] uppercase tracking-widest text-white/20">Memories Mapped</p>
        </div>
      </div>
    </div>
  );
};

const MissingKeyState: React.FC = () => (
  <div className="absolute inset-0 flex items-center justify-center p-8">
    <div className="text-center space-y-3 max-w-sm">
      <KeyRound size={28} className="mx-auto text-white/20" />
      <p className="text-sm text-white/60">Google Maps isn't connected yet</p>
      <p className="text-xs text-white/30 leading-relaxed">
        Add a Maps JavaScript API key as <code className="text-nothing-purple">VITE_GOOGLE_MAPS_API_KEY</code> in
        your environment to see real pins here.
      </p>
    </div>
  </div>
);

const LiveMap: React.FC<{ memories: Memory[] }> = ({ memories }) => {
  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: GOOGLE_MAPS_API_KEY! });
  const [selected, setSelected] = useState<Memory | null>(null);

  if (loadError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-xs text-red-400">Google Maps failed to load — check the API key.</p>
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-nothing-purple animate-pulse" />
      </div>
    );
  }

  const center = memories.length > 0
    ? { lat: memories[0].lat!, lng: memories[0].lng! }
    : { lat: 20, lng: 0 };

  return (
    <GoogleMap
      mapContainerClassName="absolute inset-0"
      center={center}
      zoom={memories.length > 0 ? 5 : 2}
      options={{
        styles: DARK_MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
      }}
    >
      {memories.map((m) => (
        <MarkerF
          key={m._id}
          position={{ lat: m.lat!, lng: m.lng! }}
          onClick={() => setSelected(m)}
        />
      ))}
      {selected && (
        <InfoWindowF
          position={{ lat: selected.lat!, lng: selected.lng! }}
          onCloseClick={() => setSelected(null)}
        >
          <div className="text-black text-sm max-w-[180px]">
            <p className="font-medium flex items-center gap-1">
              <MapPin size={12} /> {selected.title}
            </p>
            {selected.location && <p className="text-xs text-black/60">{selected.location}</p>}
          </div>
        </InfoWindowF>
      )}
    </GoogleMap>
  );
};
