import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { Memory, Id } from '../types';
import { compressImage } from '../lib/image';
import { useLightbox } from './Lightbox';
import { Plus, Maximize2, X, Edit2, Trash2, Upload, Save, Waypoints, LayoutGrid, MapPin, Loader2 } from 'lucide-react';

// Deterministic hash so a memory's position in the web is stable across
// reloads/re-renders regardless of array order — fixes the old
// Math.random()-per-render layout that reshuffled every node on any save.
function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 31) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const CATEGORIES: Memory['category'][] = ['photo', 'travel', 'food', 'milestone', 'event'];

// Phyllotaxis (sunflower) placement: even coverage with no clustering, and
// because it is driven by chronological index, adding a memory appends to the
// outside instead of reshuffling everything already on the board.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const RING_SPACING = 210;
// Below this the cards stop being recognisable, so we let the board overflow
// and be panned instead of shrinking further.
const MIN_FIT_SCALE = 0.4;

interface Node {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  memory: Memory;
  rotation: number;
}

interface Edge {
  source: Node;
  target: Node;
}

const FONTS = [
  { label: 'Handwriting', value: "'Caveat', cursive" },
  { label: 'Sans Serif', value: "'Inter', sans-serif" },
  { label: 'Serif', value: "'Playfair Display', serif" },
  { label: 'Monospace', value: "'JetBrains Mono', monospace" }
];

const SHADOW_MAP: Record<string, string> = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  '2xl': 'shadow-2xl'
};

type MemoryFormState = Partial<Memory> & { _id?: Id<'memories'> };

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

  // Form State
  const [formData, setFormData] = useState<MemoryFormState>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springX = useSpring(x, { stiffness: 150, damping: 30 });
  const springY = useSpring(y, { stiffness: 150, damping: 30 });

  // The web layout is sized against real measured space rather than assumed
  // desktop dimensions, so it has to re-run on rotate/resize.
  const [container, setContainer] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainer({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
        if (apiKey) {
          try {
            const res = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`,
            );
            const data = await res.json();
            const place = data.results?.[0]?.formatted_address;
            if (place) setFormData((prev) => ({ ...prev, location: place }));
          } catch (err) {
            console.error('Reverse geocoding failed', err);
          }
        }
        setLocating(false);
      },
      () => setLocating(false),
    );
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
    x.set(0);
    y.set(0);
  };

  const { nodes, edges, fitScale } = useMemo(() => {
    // Chronological, so index — and therefore position — is stable for every
    // existing memory when a new one is added.
    const ordered = [...memories].sort((a, b) => a._creationTime - b._creationTime);

    const placed: Node[] = ordered.map((memory, i) => {
      const id = memory._id;
      const w = memory.cardWidth || 220;
      const h = memory.cardHeight || 280;
      const angle = i * GOLDEN_ANGLE;
      const radius = RING_SPACING * Math.sqrt(i);
      const jitterX = (hashSeed(id + 'x') % 40) - 20;
      const jitterY = (hashSeed(id + 'y') % 40) - 20;
      return {
        id,
        // Cards are absolutely positioned from their top-left, so offset by
        // half the card to make `radius` measure centre-to-centre.
        x: Math.cos(angle) * radius + jitterX - w / 2,
        y: Math.sin(angle) * radius + jitterY - h / 2,
        w,
        h,
        memory,
        rotation: (hashSeed(id + 'rot') % 16) - 8,
      };
    });

    const generatedEdges: Edge[] = [];
    for (let i = 1; i < placed.length; i++) {
      generatedEdges.push({ source: placed[i], target: placed[i - 1] });
      // One extra deterministic strand for the web look. The old code picked
      // this with Math.random(), so the web re-wired itself on every save.
      if (i > 2) {
        const target = hashSeed(placed[i].id + 'link') % (i - 1);
        generatedEdges.push({ source: placed[i], target: placed[target] });
      }
    }

    /*
     * The old layout scattered cards 150–950px from a zero-size origin no
     * matter how big the viewport was. On a 390px-wide phone that put nearly
     * every card off-screen, and the distance-based opacity ramp faded the
     * survivors to nothing — hence a board that looked empty. Now the cloud
     * is measured and scaled down to fit whatever space it actually has.
     */
    let scale = 1;
    if (placed.length > 0 && container.w > 0 && container.h > 0) {
      const minX = Math.min(...placed.map((n) => n.x));
      const maxX = Math.max(...placed.map((n) => n.x + n.w));
      const minY = Math.min(...placed.map((n) => n.y));
      const maxY = Math.max(...placed.map((n) => n.y + n.h));
      const spreadX = Math.max(maxX - minX, 1);
      const spreadY = Math.max(maxY - minY, 1);
      const padding = 32;
      scale = Math.min(
        1,
        (container.w - padding) / spreadX,
        (container.h - padding) / spreadY,
      );
      scale = Math.max(scale, MIN_FIT_SCALE);

      // Recentre the cloud on the container's midpoint.
      const centreX = (minX + maxX) / 2;
      const centreY = (minY + maxY) / 2;
      for (const node of placed) {
        node.x -= centreX;
        node.y -= centreY;
      }
    }

    return { nodes: placed, edges: generatedEdges, fitScale: scale };
  }, [memories, container.w, container.h]);

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
    <div
      className="relative h-[calc(100dvh-11rem)] w-full overflow-hidden rounded-[2rem] sm:rounded-[3rem] border border-white/5 bg-[#0a0a0a] backdrop-blur-sm"
      ref={containerRef}
    >
      <div className="absolute inset-0 pointer-events-none opacity-20"
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      <div className="absolute top-5 left-5 sm:top-8 sm:left-8 z-10 space-y-1 pointer-events-none">
        <h1 className="text-xl sm:text-2xl font-medium tracking-tight dot-matrix">{viewMode === 'web' ? 'Memory Web' : 'Gallery'}</h1>
        <p className="text-white/40 text-[10px] uppercase tracking-widest">
          {viewMode === 'web' ? 'Drag to explore' : `${memories.length} memories`}
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
        <motion.div
          drag
          dragConstraints={{ left: -2000, right: 2000, top: -2000, bottom: 2000 }}
          style={{ x: springX, y: springY }}
          className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          {/* Zero-size anchor at the container's centre; the cloud is centred
              on it by the layout pass and then scaled to fit. */}
          <div className="relative" style={{ width: 0, height: 0 }}>
            <div
              className="relative"
              style={{ width: 0, height: 0, transform: `scale(${fitScale})` }}
            >
              <svg className="absolute inset-0 overflow-visible pointer-events-none">
                {edges.map((edge, i) => {
                  const x1 = edge.source.x + edge.source.w / 2;
                  const y1 = edge.source.y + edge.source.h / 2;
                  const x2 = edge.target.x + edge.target.w / 2;
                  const y2 = edge.target.y + edge.target.h / 2;
                  const midX = (x1 + x2) / 2;
                  const midY = (y1 + y2) / 2;

                  return (
                    <g key={`edge-${i}`}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeOpacity="0.15" strokeWidth="2" />
                      <foreignObject x={midX - 40} y={midY - 10} width="80" height="20" className="overflow-visible">
                        <div className="flex justify-center">
                          <span className="bg-black/80 text-white/60 text-[8px] px-2 py-1 rounded-full border border-white/10 backdrop-blur-md whitespace-nowrap">
                            {new Date(edge.source.memory._creationTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}
              </svg>

              {nodes.map((node) => (
                <MemoryCard
                  key={node.id}
                  node={node}
                  onClick={() => setSelectedMemory(node.memory)}
                />
              ))}
            </div>
          </div>
        </motion.div>
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
                        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Connected Date</p>
                        <p className="text-sm font-mono text-white/80">{selectedMemory && new Date(selectedMemory._creationTime).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface MemoryCardProps {
  node: Node;
  onClick: () => void;
}

const MemoryCard: React.FC<MemoryCardProps> = ({ node, onClick }) => {
  const w = node.w;
  const h = node.h;
  const textSize = node.memory.textSize || 14;
  const fontFamily = node.memory.fontFamily || "'Caveat', cursive";
  const textColor = node.memory.textColor || '#000000';
  const bgColor = node.memory.bgColor || '#f8f8f8';
  const borderStyle = node.memory.borderStyle || 'none';
  const borderWidth = node.memory.borderWidth || 0;
  const borderColor = node.memory.borderColor || '#000000';
  const shadowEffect = node.memory.shadowEffect || 'xl';
  const bgImageOverlay = node.memory.bgImageOverlay || '';

  /*
   * There used to be a distance-from-centre ramp here that faded cards to
   * opacity 0 past 1800px. Combined with the old oversized scatter it was the
   * reason the board rendered blank — every card was born outside the fade.
   * The layout now guarantees cards land inside the viewport, so they simply
   * stay visible.
   */
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: w,
        height: h,
        rotate: node.rotation,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="group cursor-pointer"
    >
      <div
        className={`w-full h-full p-3 pb-12 rounded-sm ${SHADOW_MAP[shadowEffect] || 'shadow-xl'} flex flex-col transition-transform duration-300 group-hover:scale-105 group-hover:z-50 relative`}
        style={{
          backgroundColor: bgColor,
          borderStyle: borderStyle,
          borderWidth: `${borderWidth}px`,
          borderColor: borderColor,
          backgroundImage: bgImageOverlay ? `url(${bgImageOverlay})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundBlendMode: bgImageOverlay ? 'overlay' : 'normal'
        }}
      >
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-red-500 shadow-md border border-red-700 z-10">
          <div className="absolute inset-1 rounded-full bg-white/30" />
        </div>

        <div className="flex-1 w-full bg-black/5 overflow-hidden relative">
          <img
            src={node.memory.imageUrl}
            alt={node.memory.title}
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-12 flex items-center justify-center px-4">
          <p
            className="truncate w-full text-center"
            style={{
              fontFamily,
              color: textColor,
              fontSize: `${textSize}px`
            }}
          >
            {node.memory.title}
          </p>
        </div>
      </div>
    </motion.div>
  );
};
