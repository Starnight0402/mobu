import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { GoogleMap, MarkerF, InfoWindowF, useLoadScript } from '@react-google-maps/api';
import { motion, AnimatePresence } from 'motion/react';
import { Navigation, LocateFixed, MapPin, KeyRound, Share2, Square, Heart, X } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { Memory } from '../types';

// A standard dark map theme (in the spirit of Snazzy Maps' "Midnight
// Commander" family) so Google's tiles match the app's black/purple palette
// instead of the default light basemap.
export const DARK_MAP_STYLE = [
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

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const MIN_WRITE_INTERVAL_MS = 12_000;
const SHARE_DURATIONS = [
  { label: '1 hour', hours: 1 },
  { label: '3 hours', hours: 3 },
  { label: '8 hours', hours: 8 },
];

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export const MapView: React.FC = () => {
  const memories = useQuery(api.memories.list) ?? [];
  const pinned = useMemo(() => memories.filter((m) => m.lat != null && m.lng != null), [memories]);
  const distinctPlaces = useMemo(
    () => new Set(memories.filter((m) => m.location).map((m) => m.location)).size,
    [memories],
  );
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    // Fixed, not part of the normal padded/scrolling page flow — a "full
    // screen like Google Maps" experience means edge-to-edge, with the
    // app's own chrome (title, stats, sharing) as floating overlays instead
    // of a boxed card the map sits inside.
    <div className="fixed inset-0 z-10 bg-[#050505]" data-no-pull-refresh>
      {GOOGLE_MAPS_API_KEY ? <LiveMap memories={pinned} /> : <MissingKeyState />}

      <div
        className="absolute inset-x-0 z-20 flex items-center justify-between gap-2 px-4 sm:px-6 pointer-events-none"
        style={{ top: 'max(1rem, calc(env(safe-area-inset-top) + 0.75rem))' }}
      >
        <div className="glass px-4 py-2.5 pointer-events-auto">
          <p className="text-sm font-medium tracking-tight leading-none">Relationship Map</p>
          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-1">
            {distinctPlaces} places &middot; {pinned.length} pinned
          </p>
        </div>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          aria-label="Live location sharing"
          className={`w-11 h-11 rounded-full glass flex items-center justify-center pointer-events-auto transition-colors ${
            panelOpen ? 'text-nothing-purple' : 'text-white/60'
          }`}
        >
          {panelOpen ? <X size={16} /> : <Share2 size={16} />}
        </button>
      </div>

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-4 sm:inset-x-6 z-20"
            style={{ top: 'max(5rem, calc(env(safe-area-inset-top) + 4.75rem))' }}
          >
            <LiveLocationPanel />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const LiveLocationPanel: React.FC = () => {
  const both = useQuery(api.liveLocations.both);
  const share = useMutation(api.liveLocations.share);
  const stopSharing = useMutation(api.liveLocations.stopSharing);
  const [sharing, setSharing] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);

  const startSharing = (hours: number) => {
    if (!navigator.geolocation) return;
    const sharingUntil = Date.now() + hours * 60 * 60 * 1000;
    setSharing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastWriteRef.current < MIN_WRITE_INTERVAL_MS) return;
        lastWriteRef.current = now;
        share({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          sharingUntil,
        });
      },
      () => setSharing(false),
      { enableHighAccuracy: true },
    );
  };

  const stop = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setSharing(false);
    stopSharing();
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const distance =
    both?.mine && both?.partner
      ? haversineKm({ lat: both.mine.lat, lng: both.mine.lng }, { lat: both.partner.lat, lng: both.partner.lng })
      : null;

  return (
    <div className="glass p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 size={14} className="text-nothing-purple" />
          <h3 className="text-[10px] uppercase tracking-widest font-medium">Live Location</h3>
        </div>
        {distance != null && (
          <p className="text-xs font-mono flex items-center gap-1 text-nothing-purple">
            {distance < 0.05 ? <><Heart size={12} /> Together</> : `${distance.toFixed(1)} km apart`}
          </p>
        )}
      </div>

      {both?.mine || sharing ? (
        <button
          onClick={stop}
          className="w-full py-3 rounded-2xl text-[10px] uppercase tracking-widest border border-white/10 text-white/60 hover:border-red-500/40 hover:text-red-400 transition-all flex items-center justify-center gap-2"
        >
          <Square size={12} /> Stop Sharing My Location
        </button>
      ) : (
        <div className="flex gap-2">
          {SHARE_DURATIONS.map((d) => (
            <button
              key={d.hours}
              onClick={() => startSharing(d.hours)}
              className="flex-1 py-3 rounded-2xl text-[10px] uppercase tracking-widest border border-white/10 text-white/60 hover:border-nothing-purple hover:text-nothing-purple transition-all"
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
      <p className="text-[9px] text-white/20 leading-relaxed">
        Only shares while this tab is open and active — closing or backgrounding the app (especially on iPhone)
        pauses updates. Not true 24/7 background tracking.
      </p>
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
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const both = useQuery(api.liveLocations.both);

  if (loadError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
        <p className="text-xs text-red-400">
          Google Maps couldn't load. Usually the API key's referrer restrictions don't include this domain yet —
          check the Google Cloud Console.
        </p>
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

  const center = both?.mine
    ? { lat: both.mine.lat, lng: both.mine.lng }
    : memories.length > 0
      ? { lat: memories[0].lat!, lng: memories[0].lng! }
      : { lat: 20, lng: 0 };

  const recenter = () => {
    if (!map) return;
    const target = both?.mine ?? (memories.length > 0 ? { lat: memories[0].lat!, lng: memories[0].lng! } : null);
    if (!target) return;
    map.panTo(target);
    map.setZoom(15);
  };

  return (
    <>
      <GoogleMap
        onLoad={setMap}
        mapContainerClassName="absolute inset-0"
        center={center}
        zoom={both?.mine || memories.length > 0 ? 6 : 2}
        options={{
          styles: DARK_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          // Single-finger pan on touch instead of requiring two fingers —
          // the whole point of full-screen is that it behaves like the
          // real Google Maps app, not an embedded widget guarding against
          // hijacking page scroll.
          gestureHandling: 'greedy',
        }}
      >
        {memories.map((m) => (
          <MarkerF
            key={m._id}
            position={{ lat: m.lat!, lng: m.lng! }}
            onClick={() => setSelected(m)}
          />
        ))}
        {both?.mine && (
          <MarkerF
            position={{ lat: both.mine.lat, lng: both.mine.lng }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#a855f7',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            }}
          />
        )}
        {both?.partner && (
          <MarkerF
            position={{ lat: both.partner.lat, lng: both.partner.lng }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#ffffff',
              fillOpacity: 1,
              strokeColor: '#a855f7',
              strokeWeight: 2,
            }}
          />
        )}
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

      {(both?.mine || memories.length > 0) && (
        <button
          onClick={recenter}
          aria-label="Recenter map"
          className="absolute z-20 w-11 h-11 rounded-full bg-white text-black shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          style={{ right: '1rem', bottom: 'max(11.5rem, calc(env(safe-area-inset-bottom) + 10.5rem))' }}
        >
          <LocateFixed size={18} />
        </button>
      )}
    </>
  );
};
