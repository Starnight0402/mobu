import React, { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { Memory, Id } from '../types';
import { compressImage } from '../lib/image';
import { reverseGeocode } from '../lib/geocode';
import { SHADOW_MAP } from '../lib/memoryCardStyle';
import { useLightbox } from './Lightbox';
import { LocationPickerModal } from './LocationPickerModal';
import { MemorySphereView, MemorySphereHandle } from './MemorySphereView';
import { Plus, Maximize2, X, Edit2, Trash2, Upload, Save, Waypoints, LayoutGrid, MapPin, MapPinned, Loader2 } from 'lucide-react';

const CATEGORIES: Memory['category'][] = ['photo', 'travel', 'food', 'milestone', 'event'];

const FONTS = [
  { label: 'Handwriting', value: "'Caveat', cursive" },
  { label: 'Sans Serif', value: "'Inter', sans-serif" },
  { label: 'Serif', value: "'Playfair Display', serif" },
  { label: 'Monospace', value: "'JetBrains Mono', monospace" }
];

type MemoryFormState = Partial<Memory> & { _id?: Id<'memories'> };

// <input type="datetime-local"> needs "YYYY-MM-DDTHH:mm" in the *local*
// timezone — toISOString() would shift it to UTC and silently move the date.
function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const MemoryBoard: React.FC = () => {
  const memories = useQuery(api.memories.list) ?? [];
  const createMemory = useMutation(api.memories.create);
  const updateMemory = useMutation(api.memories.update);
  const removeMemory = useMutation(api.memories.remove);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const { openImage } = useLightbox();

  const [isAdding, setIsAdding] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'web' | 'grid'>('web');
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Form State
  const [formData, setFormData] = useState<MemoryFormState>({});

  const sphereRef = useRef<MemorySphereHandle>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await compressImage(file);
      setFormData((prev) => ({ ...prev, imageUrl: URL.createObjectURL(blob) }));
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      const { storageId } = await res.json();
      setFormData((prev) => ({ ...prev, imageStorageId: storageId }));
    } catch (err) {
      console.error('Image upload failed', err);
    } finally {
      setUploading(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setFormData((prev) => ({ ...prev, lat, lng }));
        const place = await reverseGeocode(lat, lng);
        if (place) setFormData((prev) => ({ ...prev, location: place }));
        setLocating(false);
      },
      () => setLocating(false),
    );
  };

  const confirmMapLocation = (lat: number, lng: number, address?: string) => {
    setFormData((prev) => ({ ...prev, lat, lng, location: address || prev.location }));
    setShowMapPicker(false);
  };

  const saveMemory = async () => {
    const isNew = !formData._id;
    // A blob: preview URL is only valid in this tab — never persist it as
    // the stored imageUrl (imageStorageId, set once upload finishes, is
    // what actually gets displayed once saved).
    const isBlobPreview = formData.imageUrl?.startsWith('blob:');

    const payload = {
      title: formData.title || '',
      description: formData.description,
      imageUrl: isBlobPreview ? undefined : formData.imageUrl || `https://picsum.photos/seed/${Math.random()}/1200/800`,
      imageStorageId: formData.imageStorageId,
      category: formData.category,
      location: formData.location,
      lat: formData.lat,
      lng: formData.lng,
      memoryDate: formData.memoryDate ?? Date.now(),
      cardWidth: formData.cardWidth || 220,
      cardHeight: formData.cardHeight || 280,
      textSize: formData.textSize || 14,
      fontFamily: formData.fontFamily || "'Caveat', cursive",
      textColor: formData.textColor || '#000000',
      bgColor: formData.bgColor || '#f8f8f8',
      borderStyle: formData.borderStyle || 'none',
      borderWidth: formData.borderWidth || 0,
      borderColor: formData.borderColor || '#000000',
      shadowEffect: formData.shadowEffect || 'xl',
      bgImageOverlay: formData.bgImageOverlay || undefined,
    };

    if (isNew) {
      await createMemory(payload);
    } else {
      await updateMemory({ id: formData._id as Id<'memories'>, ...payload });
    }

    setIsAdding(false);
    setIsEditing(false);
    if (!isNew) {
      setSelectedMemory({ ...selectedMemory, ...payload } as Memory);
    }
  };

  const deleteMemory = async () => {
    if (!selectedMemory) return;
    if (confirm('Are you sure you want to delete this memory?')) {
      await removeMemory({ id: selectedMemory._id });
      setSelectedMemory(null);
      setIsEditing(false);
    }
  };

  const openAddModal = () => {
    setFormData({
      title: '',
      description: '',
      imageUrl: '',
      category: 'photo',
      location: '',
      memoryDate: Date.now(),
      cardWidth: 220,
      cardHeight: 280,
      textSize: 14,
      fontFamily: "'Caveat', cursive",
      textColor: '#000000',
      bgColor: '#f8f8f8',
      borderStyle: 'none',
      borderWidth: 0,
      borderColor: '#000000',
      shadowEffect: 'xl',
      bgImageOverlay: '',
    });
    setIsAdding(true);
  };

  const openEditMode = () => {
    setFormData(selectedMemory || {});
    setIsEditing(true);
  };

  const reCenter = () => {
    sphereRef.current?.recenter();
  };

  // Chronological, so a card's angle on the sphere — and therefore its
  // position — is stable for every existing memory when a new one is added.
  const sortedMemories = useMemo(
    () => [...memories].sort((a, b) => (a.memoryDate ?? a._creationTime) - (b.memoryDate ?? b._creationTime)),
    [memories],
  );

  const renderForm = () => (
    <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
      <div>
        <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Title</label>
        <input
          type="text"
          value={formData.title || ''}
          onChange={e => setFormData({...formData, title: e.target.value})}
          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30"
        />
      </div>
      <div>
        <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Description</label>
        <textarea
          value={formData.description || ''}
          onChange={e => setFormData({...formData, description: e.target.value})}
          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 h-24 resize-none"
        />
      </div>
      <div>
        <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Date</label>
        <input
          type="datetime-local"
          value={toDatetimeLocalValue(formData.memoryDate ?? formData._creationTime ?? Date.now())}
          onChange={e => {
            const ms = e.target.valueAsNumber;
            if (!Number.isNaN(ms)) setFormData({ ...formData, memoryDate: ms });
          }}
          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 scheme-dark"
        />
        <p className="text-[9px] text-white/30 mt-1">Defaults to upload time — set it to when the memory actually happened.</p>
      </div>
      <div>
        <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Media (Image URL or Upload)</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="https://..."
            value={formData.imageUrl || ''}
            onChange={e => setFormData({...formData, imageUrl: e.target.value})}
            className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 text-sm"
          />
          <label className="flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl px-4 cursor-pointer transition-colors">
            {uploading ? <Loader2 size={18} className="text-white animate-spin" /> : <Upload size={18} className="text-white" />}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
          </label>
        </div>
        {formData.imageUrl && (
          <div className="mt-2 h-32 rounded-lg overflow-hidden border border-white/10">
            <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Category</label>
          <select
            value={formData.category || 'photo'}
            onChange={e => setFormData({...formData, category: e.target.value as Memory['category']})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 appearance-none"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 flex items-center gap-1">
            <MapPin size={10} /> Location
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Paris, France"
              value={formData.location || ''}
              onChange={e => setFormData({...formData, location: e.target.value})}
              className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 text-sm"
            />
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locating}
              title="Use current location"
              className="flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl px-4 transition-colors disabled:opacity-50"
            >
              {locating ? <Loader2 size={16} className="text-white animate-spin" /> : <MapPin size={16} className="text-white" />}
            </button>
            <button
              type="button"
              onClick={() => setShowMapPicker(true)}
              title="Pick location on map"
              className="flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl px-4 transition-colors"
            >
              <MapPinned size={16} className="text-white" />
            </button>
          </div>
          {formData.lat != null && (
            <p className="text-[9px] text-nothing-purple font-mono mt-1">📍 {formData.lat.toFixed(4)}, {formData.lng?.toFixed(4)}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Card Width</label>
          <input
            type="number"
            value={formData.cardWidth || 220}
            onChange={e => setFormData({...formData, cardWidth: Number(e.target.value)})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Card Height</label>
          <input
            type="number"
            value={formData.cardHeight || 280}
            onChange={e => setFormData({...formData, cardHeight: Number(e.target.value)})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Text Size (px)</label>
          <input
            type="number"
            value={formData.textSize || 14}
            onChange={e => setFormData({...formData, textSize: Number(e.target.value)})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Font Family</label>
          <select
            value={formData.fontFamily || "'Caveat', cursive"}
            onChange={e => setFormData({...formData, fontFamily: e.target.value})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30 appearance-none"
          >
            {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Text Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={formData.textColor || '#000000'}
              onChange={e => setFormData({...formData, textColor: e.target.value})}
              className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-sm text-white/80 font-mono">{formData.textColor || '#000000'}</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Background Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={formData.bgColor || '#f8f8f8'}
              onChange={e => setFormData({...formData, bgColor: e.target.value})}
              className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-sm text-white/80 font-mono">{formData.bgColor || '#f8f8f8'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Border Style</label>
          <select
            value={formData.borderStyle || 'none'}
            onChange={e => setFormData({...formData, borderStyle: e.target.value})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30 appearance-none"
          >
            <option value="none">None</option>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Border Width (px)</label>
          <input
            type="number"
            value={formData.borderWidth || 0}
            onChange={e => setFormData({...formData, borderWidth: Number(e.target.value)})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Border Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={formData.borderColor || '#000000'}
              onChange={e => setFormData({...formData, borderColor: e.target.value})}
              className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-sm text-white/80 font-mono">{formData.borderColor || '#000000'}</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Shadow Effect</label>
          <select
            value={formData.shadowEffect || 'xl'}
            onChange={e => setFormData({...formData, shadowEffect: e.target.value})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30 appearance-none"
          >
            <option value="none">None</option>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
            <option value="xl">Extra Large</option>
            <option value="2xl">2x Large</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Background Image Overlay (URL)</label>
        <input
          type="text"
          placeholder="https://..."
          value={formData.bgImageOverlay || ''}
          onChange={e => setFormData({...formData, bgImageOverlay: e.target.value})}
          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 text-sm"
        />
      </div>
    </div>
  );

  return (
    <div className="relative h-[calc(100dvh-11rem)] w-full overflow-hidden rounded-[2rem] sm:rounded-[3rem] border border-white/5 bg-[#0a0a0a] backdrop-blur-sm">
      <div className="absolute inset-0 pointer-events-none opacity-20"
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      <div className="absolute top-5 left-5 sm:top-8 sm:left-8 z-10 space-y-1 pointer-events-none">
        <h1 className="text-xl sm:text-2xl font-medium tracking-tight dot-matrix">{viewMode === 'web' ? 'Hall of Memories' : 'Gallery'}</h1>
        <p className="text-white/40 text-[10px] uppercase tracking-widest">
          {viewMode === 'web' ? 'Drag to look around' : `${memories.length} memories`}
        </p>
      </div>

      <div className="absolute top-5 right-5 sm:top-8 sm:right-8 z-10 flex gap-2">
        <div className="glass p-1 flex gap-1">
          <button
            onClick={() => setViewMode('web')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${viewMode === 'web' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
            title="Memory web"
          >
            <Waypoints size={14} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${viewMode === 'grid' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
            title="Grid view"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
        {viewMode === 'web' && (
          <button
            onClick={reCenter}
            className="w-10 h-10 rounded-full glass text-white flex items-center justify-center hover:bg-white/10 transition-all"
            title="Recenter"
          >
            <Maximize2 size={16} />
          </button>
        )}
        <button
          onClick={openAddModal}
          className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all shadow-xl"
        >
          <Plus size={20} />
        </button>
      </div>

      {viewMode === 'grid' && (
        <div className="absolute inset-0 pt-28 pb-8 px-8 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {memories.map((memory) => (
              <button
                key={memory._id}
                onClick={() => setSelectedMemory(memory)}
                className="aspect-square rounded-2xl overflow-hidden glass border border-white/5 relative group text-left"
              >
                <img
                  src={memory.imageUrl}
                  alt={memory.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                  <div>
                    <p className="text-xs font-medium text-white truncate">{memory.title}</p>
                    {memory.location && (
                      <p className="text-[9px] text-white/60 flex items-center gap-1 mt-0.5">
                        <MapPin size={9} /> {memory.location}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {memories.length === 0 && (
            <div className="h-full flex items-center justify-center text-white/20 text-xs uppercase tracking-widest">
              No memories yet
            </div>
          )}
        </div>
      )}

      {viewMode === 'web' && (
        <MemorySphereView ref={sphereRef} memories={sortedMemories} onSelect={setSelectedMemory} />
      )}

      {viewMode === 'web' && memories.length === 0 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <p className="text-white/20 text-xs uppercase tracking-widest">No memories yet</p>
        </div>
      )}

      {/* Detail / Edit Modal */}
      <AnimatePresence>
        {(selectedMemory || isAdding) && (
          <div className="fixed inset-0 z-[100] flex items-stretch md:items-center justify-center p-0 md:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              onClick={() => {
                setSelectedMemory(null);
                setIsAdding(false);
                setIsEditing(false);
              }}
            />
            {/* Phone gets a true full-screen sheet: in the old centred dialog
                the image pane was `flex-1` inside a column whose other half
                was a long form, so the photo collapsed to a sliver. */}
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 20 }}
              className="relative bg-[#111] border-0 md:border border-white/10 rounded-none md:rounded-2xl overflow-hidden w-full max-w-5xl flex flex-col md:flex-row h-full md:h-auto md:max-h-[90vh] shadow-2xl"
            >
              {/* Left Side: Preview */}
              <div className="shrink-0 md:flex-1 h-[36dvh] md:h-auto overflow-hidden bg-black flex items-center justify-center p-4 md:p-8 relative">
                {isEditing || isAdding ? (
                  <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
                    {/* Live Preview of the card */}
                    <div
                      style={{
                        width: formData.cardWidth || 220,
                        height: formData.cardHeight || 280,
                        backgroundColor: formData.bgColor || '#f8f8f8',
                        color: formData.textColor || '#000000',
                        fontFamily: formData.fontFamily || "'Caveat', cursive",
                        borderStyle: formData.borderStyle || 'none',
                        borderWidth: `${formData.borderWidth || 0}px`,
                        borderColor: formData.borderColor || '#000000',
                        backgroundImage: formData.bgImageOverlay ? `url(${formData.bgImageOverlay})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundBlendMode: formData.bgImageOverlay ? 'overlay' : 'normal'
                      }}
                      className={`p-3 pb-12 rounded-sm ${SHADOW_MAP[formData.shadowEffect || 'xl'] || 'shadow-xl'} flex flex-col relative`}
                    >
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-red-500 shadow-md border border-red-700 z-10">
                        <div className="absolute inset-1 rounded-full bg-white/30" />
                      </div>
                      <div className="flex-1 w-full bg-black/10 overflow-hidden relative">
                        {formData.imageUrl && (
                          <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-12 flex items-center justify-center px-4">
                        <p className="truncate w-full text-center" style={{ fontSize: `${formData.textSize || 14}px` }}>
                          {formData.title || 'Memory Title'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  selectedMemory?.imageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        openImage({
                          src: selectedMemory.imageUrl as string,
                          alt: selectedMemory.title,
                          caption: selectedMemory.title,
                          subcaption: selectedMemory.location,
                        })
                      }
                      className="w-full h-full flex items-center justify-center"
                      aria-label="View photo full screen"
                    >
                      <img
                        src={selectedMemory.imageUrl}
                        alt={selectedMemory.title}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                  )
                )}
              </div>

              {/* Right Side: Info or Form */}
              <div className="w-full md:w-[400px] flex-1 min-h-0 p-5 md:p-8 flex flex-col bg-[#111] overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-serif text-white">
                    {isAdding ? 'Pin New Memory' : isEditing ? 'Edit Memory' : 'Memory Details'}
                  </h3>
                  <div className="flex items-center gap-2">
                    {selectedMemory && !isEditing && !isAdding && (
                      <>
                        <button onClick={openEditMode} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"><Edit2 size={14} /></button>
                        <button onClick={deleteMemory} className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 transition-colors"><Trash2 size={14} /></button>
                      </>
                    )}
                    <button onClick={() => { setSelectedMemory(null); setIsAdding(false); setIsEditing(false); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"><X size={16} /></button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                  {isEditing || isAdding ? (
                    <>
                      {renderForm()}
                      <div className="pt-6 mt-auto">
                        <button
                          onClick={saveMemory}
                          disabled={uploading}
                          className="w-full py-4 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                          {uploading ? 'Uploading…' : isAdding ? 'Add to Web' : 'Save Changes'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col h-full justify-between">
                      <div className="space-y-6">
                        <h3 className="text-3xl font-serif tracking-tight text-white">{selectedMemory?.title}</h3>
                        <p className="text-sm text-white/60 leading-relaxed">{selectedMemory?.description}</p>
                      </div>
                      <div className="pt-8 border-t border-white/10 mt-8">
                        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Date</p>
                        <p className="text-sm font-mono text-white/80">
                          {selectedMemory && new Date(selectedMemory.memoryDate ?? selectedMemory._creationTime).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showMapPicker && (
        <LocationPickerModal
          initialLat={formData.lat}
          initialLng={formData.lng}
          onConfirm={confirmMapLocation}
          onClose={() => setShowMapPicker(false)}
        />
      )}
    </div>
  );
};
