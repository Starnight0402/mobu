import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { useDropzone } from 'react-dropzone';
import { parse as readExif, gps as readGps } from 'exifr';
import { ImagePlus, X, MapPin, MapPinned, Loader2, Check, AlertTriangle, Crosshair } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { Id, Memory } from '../types';
import { compressImage } from '../lib/image';
import { reverseGeocode } from '../lib/geocode';
import { useBackHandler } from '../lib/backButtonStack';
import { LocationPickerModal } from './LocationPickerModal';

const MAX_PHOTOS = 100;
const UPLOAD_CONCURRENCY = 3;
const CATEGORIES: { value: Memory['category']; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'travel', label: 'Travel' },
  { value: 'food', label: 'Food' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'event', label: 'Event' },
];

type Status = 'queued' | 'uploading' | 'done' | 'error';

interface Photo {
  id: string;
  file: File;
  preview: string;
  takenAt?: number;
  lat?: number;
  lng?: number;
  status: Status;
  storageId?: Id<'_storage'>;
}

const toDateInput = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// Noon, so a timezone shift can never push the memory onto a neighbouring day.
const fromDateInput = (s: string) => new Date(`${s}T12:00:00`).getTime();

const fieldClass =
  'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder:text-white/25 focus:outline-none focus:border-nothing-purple/60';
const labelClass = 'text-[11px] text-white/50 uppercase tracking-widest mb-2 block';

export const MemoryComposer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const createMany = useMutation(api.memories.createMany);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<Memory['category']>('photo');
  const [dateStr, setDateStr] = useState(toDateInput(Date.now()));
  const [dateTouched, setDateTouched] = useState(false);
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationTouched, setLocationTouched] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Photos live in a ref too: the upload workers outlive any one render and
  // must read the latest statuses/storage ids, not a stale closure copy.
  const photosRef = useRef<Photo[]>([]);
  photosRef.current = photos;
  const patchPhoto = useCallback((id: string, p: Partial<Photo>) => {
    setPhotos((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
    photosRef.current = photosRef.current.map((x) => (x.id === id ? { ...x, ...p } : x));
  }, []);

  useBackHandler(showMap, () => setShowMap(false));
  useBackHandler(!showMap && !saving, onClose);

  // Free the object URLs when the composer goes away.
  useEffect(
    () => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)),
    [],
  );

  // Photos carry their own capture time and GPS. Read it before compression
  // (which re-encodes through a canvas and drops EXIF), then fill the date and
  // place for the whole set — unless the user already typed something.
  const enrich = useCallback(async (added: Photo[]) => {
    await Promise.all(
      added.map(async (p) => {
        try {
          const [exif, pos] = await Promise.all([
            readExif(p.file, ['DateTimeOriginal', 'CreateDate']),
            readGps(p.file),
          ]);
          const when = exif?.DateTimeOriginal ?? exif?.CreateDate;
          const takenAt = when instanceof Date && !Number.isNaN(+when) ? +when : undefined;
          patchPhoto(p.id, { takenAt, lat: pos?.latitude, lng: pos?.longitude });
        } catch {
          // No readable EXIF (screenshots, downloads) — the user can set it by hand.
        }
      }),
    );
  }, [patchPhoto]);

  const onDrop = useCallback(
    (accepted: File[]) => {
      setError(null);
      const room = MAX_PHOTOS - photosRef.current.length;
      if (accepted.length > room) setError(`Up to ${MAX_PHOTOS} photos at a time — the rest were skipped.`);
      const added: Photo[] = accepted.slice(0, Math.max(room, 0)).map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        preview: URL.createObjectURL(file),
        status: 'queued',
      }));
      if (!added.length) return;
      setPhotos((prev) => [...prev, ...added]);
      photosRef.current = [...photosRef.current, ...added];
      void enrich(added);
    },
    [enrich],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    noClick: photos.length > 0,
    noKeyboard: true,
  });

  const removePhoto = (id: string) => {
    const gone = photosRef.current.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.preview);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    photosRef.current = photosRef.current.filter((p) => p.id !== id);
  };

  // Suggested date / place from the photos, applied only while untouched.
  useEffect(() => {
    if (dateTouched) return;
    const times = photos.map((p) => p.takenAt).filter((t): t is number => t != null);
    if (times.length) setDateStr(toDateInput(Math.min(...times)));
  }, [photos, dateTouched]);

  const firstGps = photos.find((p) => p.lat != null && p.lng != null);
  useEffect(() => {
    if (locationTouched || !firstGps) return;
    const { lat, lng } = firstGps as Required<Pick<Photo, 'lat' | 'lng'>>;
    setCoords({ lat, lng });
    let live = true;
    void reverseGeocode(lat, lng).then((place) => {
      if (live && place) setLocation(place);
    });
    return () => {
      live = false;
    };
  }, [firstGps?.lat, firstGps?.lng, locationTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCoords({ lat, lng });
        setLocationTouched(true);
        const place = await reverseGeocode(lat, lng);
        if (place) setLocation(place);
        setLocating(false);
      },
      () => setLocating(false),
    );
  };

  const uploadOne = async (p: Photo) => {
    patchPhoto(p.id, { status: 'uploading' });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const blob = await compressImage(p.file);
        const url = await generateUploadUrl();
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        const { storageId } = await res.json();
        patchPhoto(p.id, { status: 'done', storageId });
        return;
      } catch (err) {
        console.error('Photo upload failed', err);
      }
    }
    patchPhoto(p.id, { status: 'error' });
  };

  const save = async () => {
    if (saving) return;
    if (!photos.length) return setError('Add at least one photo.');
    if (!title.trim()) return setError('Give this memory a name.');
    setError(null);
    setSaving(true);
    try {
      // Only photos not yet stored are uploaded, so a retry after a dropped
      // connection resumes instead of starting over.
      const todo = photosRef.current.filter((p) => p.status !== 'done');
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, todo.length) }, async () => {
          while (cursor < todo.length) await uploadOne(todo[cursor++]);
        }),
      );

      const current = photosRef.current;
      const failed = current.filter((p) => p.status !== 'done').length;
      if (failed) {
        setError(`${failed} photo${failed === 1 ? '' : 's'} didn't upload. Check your connection and tap Save again to retry.`);
        return;
      }

      const sharedDate = fromDateInput(dateStr);
      await createMany({
        albumName: current.length > 1 ? title.trim() : undefined,
        items: current.map((p, i) => ({
          title: title.trim(),
          description: i === 0 && note.trim() ? note.trim() : undefined,
          imageStorageId: p.storageId,
          category,
          location: location.trim() || undefined,
          lat: p.lat ?? coords?.lat,
          lng: p.lng ?? coords?.lng,
          // Untouched date: every photo keeps its own capture time, so an
          // album sorts the way the trip actually unfolded.
          memoryDate: dateTouched || p.takenAt == null ? sharedDate : p.takenAt,
        })),
      });
      onClose();
    } catch (err) {
      console.error('Saving memories failed', err);
      setError(err instanceof Error ? err.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const done = photos.filter((p) => p.status === 'done').length;
  const many = photos.length > 1;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col" data-no-auto-reload data-no-pull-refresh>
      <header className="shrink-0 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-white/5">
        <div>
          <h2 className="text-xl font-serif text-white">New memory</h2>
          <p className="text-[11px] text-white/40 mt-0.5">
            {photos.length ? `${photos.length} photo${many ? 's' : ''} selected` : 'Pick one photo or a whole trip'}
          </p>
        </div>
        <button
          onClick={onClose}
          disabled={saving}
          aria-label="Close"
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-40"
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-6">
        {/* Photos */}
        <section>
          <div
            {...getRootProps()}
            className={`rounded-3xl border-2 border-dashed transition-colors ${
              isDragActive ? 'border-nothing-purple bg-nothing-purple/10' : 'border-white/15 bg-white/[0.03]'
            } ${photos.length ? 'p-3' : 'p-8 cursor-pointer'}`}
          >
            <input {...getInputProps()} />
            {photos.length === 0 ? (
              <div className="flex flex-col items-center text-center gap-3 py-4">
                <div className="w-14 h-14 rounded-full bg-nothing-purple/20 text-nothing-purple flex items-center justify-center">
                  <ImagePlus size={26} />
                </div>
                <p className="text-white font-medium">Add photos</p>
                <p className="text-white/40 text-xs max-w-[16rem]">
                  Select as many as you like — a whole trip at once. We'll read the date and place from the photos.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {photos.map((p, i) => (
                  <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-white/5">
                    <img
                      src={p.preview}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={`w-full h-full object-cover ${p.status === 'uploading' ? 'opacity-50' : ''}`}
                    />
                    {i === 0 && many && (
                      <span className="absolute bottom-1 left-1 text-[9px] uppercase tracking-wider bg-black/70 text-white px-1.5 py-0.5 rounded-full">
                        Cover
                      </span>
                    )}
                    {p.status === 'uploading' && (
                      <Loader2 size={18} className="absolute inset-0 m-auto text-white animate-spin" />
                    )}
                    {p.status === 'done' && (
                      <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-emerald-500 text-black flex items-center justify-center">
                        <Check size={12} />
                      </span>
                    )}
                    {p.status === 'error' && (
                      <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center">
                        <AlertTriangle size={11} />
                      </span>
                    )}
                    {!saving && (
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        aria-label="Remove photo"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {!saving && photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={open}
                    className="aspect-square rounded-xl border border-dashed border-white/20 text-white/60 hover:text-white hover:border-white/40 flex flex-col items-center justify-center gap-1"
                  >
                    <ImagePlus size={20} />
                    <span className="text-[10px]">Add more</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Details */}
        <section className="space-y-5">
          <div>
            <label className={labelClass} htmlFor="mc-title">
              {many ? 'Album name' : 'Title'}
            </label>
            <input
              id="mc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={many ? 'e.g. Goa trip' : 'What happened?'}
              autoComplete="off"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="mc-note">
              Note <span className="normal-case tracking-normal text-white/30">(optional)</span>
            </label>
            <textarea
              id="mc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="A line you'll want to remember"
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass} htmlFor="mc-date">
                Date
              </label>
              <input
                id="mc-date"
                type="date"
                value={dateStr}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setDateStr(e.target.value);
                  setDateTouched(true);
                }}
                className={`${fieldClass} scheme-dark`}
              />
              <p className="text-[11px] text-white/30 mt-1.5">
                {dateTouched ? 'Same date for every photo.' : 'Each photo keeps the time it was taken.'}
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="mc-loc">
                Place
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    id="mc-loc"
                    type="text"
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value);
                      setLocationTouched(true);
                    }}
                    placeholder="Where was this?"
                    autoComplete="off"
                    className={`${fieldClass} pl-10`}
                  />
                </div>
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  aria-label="Use current location"
                  className="w-12 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center"
                >
                  {locating ? <Loader2 size={16} className="animate-spin" /> : <Crosshair size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMap(true)}
                  aria-label="Pick on map"
                  className="w-12 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center"
                >
                  <MapPinned size={16} />
                </button>
              </div>
            </div>
          </div>

          <div>
            <span className={labelClass}>Type</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                    category === c.value
                      ? 'bg-white text-black border-white'
                      : 'bg-white/5 text-white/70 border-white/10 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <footer className="shrink-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/5 bg-[#0a0a0a] space-y-3">
        {saving && photos.length > 0 && (
          <div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-nothing-purple transition-all duration-300"
                style={{ width: `${(done / photos.length) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-white/50 mt-1.5">
              {done < photos.length ? `Uploading ${done} of ${photos.length}…` : 'Saving…'}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-white text-black font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : null}
          {saving ? 'Saving…' : many ? `Add ${photos.length} photos to the board` : 'Add to the board'}
        </button>
      </footer>

      {showMap && (
        <LocationPickerModal
          initialLat={coords?.lat}
          initialLng={coords?.lng}
          onConfirm={(lat, lng, address) => {
            setCoords({ lat, lng });
            if (address) setLocation(address);
            setLocationTouched(true);
            setShowMap(false);
          }}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  );
};
