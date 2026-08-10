import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleMap, MarkerF, useLoadScript } from '@react-google-maps/api';
import { X, Check, LocateFixed, KeyRound, Loader2 } from 'lucide-react';
import { DARK_MAP_STYLE, GOOGLE_MAPS_API_KEY } from './MapView';
import { reverseGeocode } from '../lib/geocode';

interface LocationPickerModalProps {
  initialLat?: number;
  initialLng?: number;
  onConfirm: (lat: number, lng: number, address?: string) => void;
  onClose: () => void;
}

const DEFAULT_CENTER = { lat: 20, lng: 0 };

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  initialLat,
  initialLng,
  onConfirm,
  onClose,
}) => {
  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: GOOGLE_MAPS_API_KEY || '' });
  const hasInitial = initialLat != null && initialLng != null;
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(
    hasInitial ? { lat: initialLat as number, lng: initialLng as number } : null,
  );
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
    );
  };

  const confirm = async () => {
    if (!marker) return;
    setConfirming(true);
    const address = await reverseGeocode(marker.lat, marker.lng);
    setConfirming(false);
    onConfirm(marker.lat, marker.lng, address);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-stretch md:items-center justify-center p-0 md:p-12">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/95 backdrop-blur-md"
          onClick={onClose}
        />
        <motion.div
          initial={{ scale: 0.98, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.98, opacity: 0, y: 20 }}
          className="relative bg-[#111] border-0 md:border border-white/10 rounded-none md:rounded-2xl overflow-hidden w-full max-w-2xl h-full md:h-[80vh] flex flex-col shadow-2xl"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div>
              <h3 className="text-lg font-serif text-white">Choose Location</h3>
              <p className="text-[10px] uppercase tracking-widest text-white/40">Tap or drag the pin to set it</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative flex-1 bg-[#050505]">
            {!GOOGLE_MAPS_API_KEY ? (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="text-center space-y-3 max-w-sm">
                  <KeyRound size={28} className="mx-auto text-white/20" />
                  <p className="text-sm text-white/60">Google Maps isn't connected yet</p>
                  <p className="text-xs text-white/30 leading-relaxed">
                    Add <code className="text-nothing-purple">VITE_GOOGLE_MAPS_API_KEY</code> to pick a location on
                    the map.
                  </p>
                </div>
              </div>
            ) : loadError ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-xs text-red-400">Google Maps failed to load — check the API key.</p>
              </div>
            ) : !isLoaded ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-nothing-purple animate-pulse" />
              </div>
            ) : (
              <GoogleMap
                mapContainerClassName="absolute inset-0"
                center={marker || DEFAULT_CENTER}
                zoom={marker ? 12 : 2}
                options={{ styles: DARK_MAP_STYLE, disableDefaultUI: true, zoomControl: true }}
                onClick={(e) => {
                  if (e.latLng) setMarker({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                }}
              >
                {marker && (
                  <MarkerF
                    position={marker}
                    draggable
                    onDragEnd={(e) => {
                      if (e.latLng) setMarker({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                    }}
                  />
                )}
              </GoogleMap>
            )}

            {GOOGLE_MAPS_API_KEY && isLoaded && (
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="absolute bottom-4 right-4 flex items-center gap-2 bg-[#111]/90 hover:bg-[#111] border border-white/10 rounded-full px-4 py-2 text-xs text-white transition-colors disabled:opacity-50"
              >
                {locating ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
                My Location
              </button>
            )}
          </div>

          <div className="p-5 border-t border-white/10 flex items-center justify-between gap-4">
            <p className="text-[10px] font-mono text-white/40">
              {marker ? `📍 ${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}` : 'No location selected'}
            </p>
            <button
              onClick={confirm}
              disabled={!marker || confirming}
              className="flex items-center justify-center gap-2 bg-white text-black rounded-xl font-medium px-6 py-3 hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {confirming ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Use This Location
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
