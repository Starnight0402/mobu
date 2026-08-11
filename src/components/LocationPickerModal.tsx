import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Autocomplete, GoogleMap, MarkerF, useLoadScript } from '@react-google-maps/api';
import { X, Check, LocateFixed, KeyRound, Loader2, Search, Layers } from 'lucide-react';
import { DARK_MAP_STYLE, GOOGLE_MAPS_API_KEY } from './MapView';
import { reverseGeocode } from '../lib/geocode';

interface LocationPickerModalProps {
  initialLat?: number;
  initialLng?: number;
  onConfirm: (lat: number, lng: number, address?: string) => void;
  onClose: () => void;
}

const DEFAULT_CENTER = { lat: 20, lng: 0 };

// Stable reference required by @react-google-maps/api — a new array on every
// render forces it to tear down and reload the Places library in a loop.
const PLACES_LIBRARIES: 'places'[] = ['places'];

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  initialLat,
  initialLng,
  onConfirm,
  onClose,
}) => {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || '',
    libraries: PLACES_LIBRARIES,
  });
  const hasInitial = initialLat != null && initialLng != null;
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(
    hasInitial ? { lat: initialLat as number, lng: initialLng as number } : null,
  );
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [satellite, setSatellite] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const placeMarker = (lat: number, lng: number, zoom = 16) => {
    setMarker({ lat, lng });
    const map = mapRef.current;
    if (map) {
      map.panTo({ lat, lng });
      if (map.getZoom() == null || map.getZoom()! < zoom) map.setZoom(zoom);
    }
  };

  const onPlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    setSearchText(place.formatted_address || place.name || '');
    setMarker({ lat, lng });
    const map = mapRef.current;
    if (map) {
      if (place.geometry.viewport) {
        map.fitBounds(place.geometry.viewport);
      } else {
        map.panTo({ lat, lng });
        map.setZoom(16);
      }
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        placeMarker(pos.coords.latitude, pos.coords.longitude, 16);
        setLocating(false);
      },
      () => setLocating(false),
    );
  };

  const confirm = async () => {
    if (!marker) return;
    setConfirming(true);
    const address = searchText.trim() || (await reverseGeocode(marker.lat, marker.lng));
    setConfirming(false);
    onConfirm(marker.lat, marker.lng, address);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-200">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="relative w-full h-full flex flex-col"
        >
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
                zoom={marker ? 16 : 2}
                onLoad={onMapLoad}
                options={{
                  styles: satellite ? undefined : DARK_MAP_STYLE,
                  mapTypeId: satellite ? 'hybrid' : 'roadmap',
                  disableDefaultUI: true,
                  zoomControl: true,
                  zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
                  gestureHandling: 'greedy',
                  tilt: 45,
                  rotateControl: true,
                  rotateControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
                  clickableIcons: false,
                }}
                onClick={(e) => {
                  if (e.latLng) {
                    setSearchText('');
                    placeMarker(e.latLng.lat(), e.latLng.lng(), mapRef.current?.getZoom() ?? 16);
                  }
                }}
              >
                {marker && (
                  <MarkerF
                    position={marker}
                    draggable
                    onDragEnd={(e) => {
                      if (e.latLng) {
                        setSearchText('');
                        setMarker({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                      }
                    }}
                  />
                )}
              </GoogleMap>
            )}

            {/* Floating top bar: search + close, Google Maps app style */}
            <div className="absolute top-0 inset-x-0 z-10 p-3 sm:p-4 flex items-center gap-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
              {GOOGLE_MAPS_API_KEY && isLoaded ? (
                <Autocomplete
                  onLoad={(ac) => (autocompleteRef.current = ac)}
                  onPlaceChanged={onPlaceChanged}
                  className="flex-1"
                >
                  <div className="flex items-center gap-2 bg-[#161616]/95 border border-white/10 rounded-full pl-4 pr-2 py-2.5 shadow-2xl backdrop-blur-md">
                    <Search size={16} className="text-white/40 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search for a place"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                    />
                  </div>
                </Autocomplete>
              ) : (
                <div className="flex-1" />
              )}
              <button
                onClick={onClose}
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-[#161616]/95 border border-white/10 hover:bg-[#222] text-white transition-colors shadow-2xl backdrop-blur-md"
              >
                <X size={18} />
              </button>
            </div>

            {GOOGLE_MAPS_API_KEY && isLoaded && (
              <div className="absolute right-3 sm:right-4 bottom-32 z-10 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setSatellite((s) => !s)}
                  title="Toggle satellite / 3D imagery"
                  className={`w-11 h-11 flex items-center justify-center rounded-full border border-white/10 shadow-2xl backdrop-blur-md transition-colors ${
                    satellite ? 'bg-white text-black' : 'bg-[#161616]/95 text-white hover:bg-[#222]'
                  }`}
                >
                  <Layers size={16} />
                </button>
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={locating}
                  title="Use my location"
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-[#161616]/95 hover:bg-[#222] border border-white/10 text-white transition-colors disabled:opacity-50 shadow-2xl backdrop-blur-md"
                >
                  {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                </button>
              </div>
            )}
          </div>

          {/* Floating bottom sheet: coordinates + confirm */}
          <div className="absolute bottom-0 inset-x-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="bg-[#111]/95 border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-2xl backdrop-blur-md">
              <p className="text-[10px] font-mono text-white/40 truncate">
                {marker ? `📍 ${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}` : 'Tap the map or search to set a location'}
              </p>
              <button
                onClick={confirm}
                disabled={!marker || confirming}
                className="flex items-center justify-center gap-2 bg-white text-black rounded-xl font-medium px-6 py-3 hover:bg-white/90 transition-colors disabled:opacity-50 shrink-0"
              >
                {confirming ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Use This Location
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
