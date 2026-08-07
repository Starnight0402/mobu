import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Memory } from '../types';
import { Plus, Maximize2, X, Edit2, Trash2, Upload, Save } from 'lucide-react';

interface Node {
  id: string;
  x: number;
  y: number;
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

export const MemoryBoard: React.FC = () => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState<Partial<Memory>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springX = useSpring(x, { stiffness: 150, damping: 30 });
  const springY = useSpring(y, { stiffness: 150, damping: 30 });

  const fetchMemories = () => {
    fetch('/api/memories').then(res => res.json()).then(setMemories);
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image_url: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const saveMemory = async () => {
    const isNew = !formData.id;
    const url = isNew ? '/api/memories' : `/api/memories/${formData.id}`;
    const method = isNew ? 'POST' : 'PUT';
    
    const payload = {
      ...formData,
      image_url: formData.image_url || `https://picsum.photos/seed/${Math.random()}/1200/800`,
      card_width: formData.card_width || 220,
      card_height: formData.card_height || 280,
      text_size: formData.text_size || 14,
      font_family: formData.font_family || "'Caveat', cursive",
      text_color: formData.text_color || '#000000',
      bg_color: formData.bg_color || '#f8f8f8',
      border_style: formData.border_style || 'none',
      border_width: formData.border_width || 0,
      border_color: formData.border_color || '#000000',
      shadow_effect: formData.shadow_effect || 'xl',
      bg_image_overlay: formData.bg_image_overlay || ''
    };

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      fetchMemories();
      setIsAdding(false);
      setIsEditing(false);
      if (!isNew) {
        setSelectedMemory({ ...selectedMemory, ...payload } as Memory);
      }
    }
  };

  const deleteMemory = async () => {
    if (!selectedMemory) return;
    if (confirm('Are you sure you want to delete this memory?')) {
      await fetch(`/api/memories/${selectedMemory.id}`, { method: 'DELETE' });
      fetchMemories();
      setSelectedMemory(null);
      setIsEditing(false);
    }
  };

  const openAddModal = () => {
    setFormData({
      title: '',
      description: '',
      image_url: '',
      card_width: 220,
      card_height: 280,
      text_size: 14,
      font_family: "'Caveat', cursive",
      text_color: '#000000',
      bg_color: '#f8f8f8',
      border_style: 'none',
      border_width: 0,
      border_color: '#000000',
      shadow_effect: 'xl',
      bg_image_overlay: ''
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

  const { nodes, edges } = useMemo(() => {
    const generatedNodes: Node[] = memories.map((memory, i) => {
      const angle = i * 2.4;
      const radius = 150 + i * 100;
      const posX = Math.cos(angle) * radius + (Math.random() * 100 - 50);
      const posY = Math.sin(angle) * radius + (Math.random() * 100 - 50);
      const rotation = Math.random() * 20 - 10;
      return { id: memory.id.toString(), x: posX, y: posY, memory, rotation };
    });

    const generatedEdges: Edge[] = [];
    for (let i = 1; i < generatedNodes.length; i++) {
      generatedEdges.push({ source: generatedNodes[i], target: generatedNodes[i - 1] });
      if (i > 2) {
        const randomTarget = Math.floor(Math.random() * (i - 1));
        generatedEdges.push({ source: generatedNodes[i], target: generatedNodes[randomTarget] });
      }
    }

    return { nodes: generatedNodes, edges: generatedEdges };
  }, [memories]);

  const renderForm = () => (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
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
            value={formData.image_url || ''}
            onChange={e => setFormData({...formData, image_url: e.target.value})}
            className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 text-sm"
          />
          <label className="flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl px-4 cursor-pointer transition-colors">
            <Upload size={18} className="text-white" />
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
        </div>
        {formData.image_url && (
          <div className="mt-2 h-32 rounded-lg overflow-hidden border border-white/10">
            <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Card Width</label>
          <input 
            type="number" 
            value={formData.card_width || 220}
            onChange={e => setFormData({...formData, card_width: Number(e.target.value)})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Card Height</label>
          <input 
            type="number" 
            value={formData.card_height || 280}
            onChange={e => setFormData({...formData, card_height: Number(e.target.value)})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Text Size (px)</label>
          <input 
            type="number" 
            value={formData.text_size || 14}
            onChange={e => setFormData({...formData, text_size: Number(e.target.value)})}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Font Family</label>
          <select 
            value={formData.font_family || "'Caveat', cursive"}
            onChange={e => setFormData({...formData, font_family: e.target.value})}
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
              value={formData.text_color || '#000000'}
              onChange={e => setFormData({...formData, text_color: e.target.value})}
              className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-sm text-white/80 font-mono">{formData.text_color || '#000000'}</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Background Color</label>
          <div className="flex items-center gap-2">
            <input 
              type="color" 
              value={formData.bg_color || '#f8f8f8'}
              onChange={e => setFormData({...formData, bg_color: e.target.value})}
              className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-sm text-white/80 font-mono">{formData.bg_color || '#f8f8f8'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Border Style</label>
          <select 
            value={formData.border_style || 'none'}
            onChange={e => setFormData({...formData, border_style: e.target.value})}
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
            value={formData.border_width || 0}
            onChange={e => setFormData({...formData, border_width: Number(e.target.value)})}
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
              value={formData.border_color || '#000000'}
              onChange={e => setFormData({...formData, border_color: e.target.value})}
              className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-sm text-white/80 font-mono">{formData.border_color || '#000000'}</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-white/60 uppercase tracking-widest mb-1 block">Shadow Effect</label>
          <select 
            value={formData.shadow_effect || 'xl'}
            onChange={e => setFormData({...formData, shadow_effect: e.target.value})}
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
          value={formData.bg_image_overlay || ''}
          onChange={e => setFormData({...formData, bg_image_overlay: e.target.value})}
          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 text-sm"
        />
      </div>
    </div>
  );

  return (
    <div className="relative h-[80vh] w-full overflow-hidden rounded-[3rem] border border-white/5 bg-[#0a0a0a] backdrop-blur-sm" ref={containerRef}>
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      <div className="absolute top-8 left-8 z-10 space-y-1 pointer-events-none">
        <h1 className="text-2xl font-medium tracking-tight dot-matrix">Memory Web</h1>
        <p className="text-white/40 text-[10px] uppercase tracking-widest">Pan to explore connections</p>
      </div>

      <div className="absolute top-8 right-8 z-10 flex gap-2">
        <button 
          onClick={reCenter}
          className="w-10 h-10 rounded-full glass text-white flex items-center justify-center hover:bg-white/10 transition-all"
          title="Recenter"
        >
          <Maximize2 size={16} />
        </button>
        <button 
          onClick={openAddModal}
          className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all shadow-xl"
        >
          <Plus size={20} />
        </button>
      </div>

      <motion.div
        drag
        dragConstraints={{ left: -3000, right: 3000, top: -3000, bottom: 3000 }}
        style={{ x: springX, y: springY }}
        className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing"
      >
        <div className="relative" style={{ width: 0, height: 0 }}>
          <svg className="absolute inset-0 overflow-visible pointer-events-none">
            {edges.map((edge, i) => {
              const w1 = edge.source.memory.card_width || 220;
              const h1 = edge.source.memory.card_height || 280;
              const w2 = edge.target.memory.card_width || 220;
              const h2 = edge.target.memory.card_height || 280;
              
              const x1 = edge.source.x + w1 / 2;
              const y1 = edge.source.y + h1 / 2;
              const x2 = edge.target.x + w2 / 2;
              const y2 = edge.target.y + h2 / 2;
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              
              return (
                <g key={`edge-${i}`}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeOpacity="0.15" strokeWidth="2" />
                  <foreignObject x={midX - 40} y={midY - 10} width="80" height="20" className="overflow-visible">
                    <div className="flex justify-center">
                      <span className="bg-black/80 text-white/60 text-[8px] px-2 py-1 rounded-full border border-white/10 backdrop-blur-md whitespace-nowrap">
                        {new Date(edge.source.memory.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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
              parentX={springX} 
              parentY={springY}
              onClick={() => setSelectedMemory(node.memory)}
            />
          ))}
        </div>
      </motion.div>

      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-2 h-2 bg-white/20 rounded-full" />
      </div>

      {/* Detail / Edit Modal */}
      <AnimatePresence>
        {(selectedMemory || isAdding) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12">
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
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-[#111] border border-white/10 rounded-2xl overflow-hidden w-full max-w-5xl flex flex-col md:flex-row max-h-[90vh] shadow-2xl"
            >
              {/* Left Side: Preview */}
              <div className="flex-1 overflow-hidden bg-black flex items-center justify-center p-8 relative">
                {isEditing || isAdding ? (
                  <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
                    {/* Live Preview of the card */}
                    <div 
                      style={{ 
                        width: formData.card_width || 220, 
                        height: formData.card_height || 280,
                        backgroundColor: formData.bg_color || '#f8f8f8',
                        color: formData.text_color || '#000000',
                        fontFamily: formData.font_family || "'Caveat', cursive",
                        borderStyle: formData.border_style || 'none',
                        borderWidth: `${formData.border_width || 0}px`,
                        borderColor: formData.border_color || '#000000',
                        backgroundImage: formData.bg_image_overlay ? `url(${formData.bg_image_overlay})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundBlendMode: formData.bg_image_overlay ? 'overlay' : 'normal'
                      }}
                      className={`p-3 pb-12 rounded-sm ${SHADOW_MAP[formData.shadow_effect || 'xl'] || 'shadow-xl'} flex flex-col relative`}
                    >
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-red-500 shadow-md border border-red-700 z-10">
                        <div className="absolute inset-1 rounded-full bg-white/30" />
                      </div>
                      <div className="flex-1 w-full bg-black/10 overflow-hidden relative">
                        {formData.image_url && (
                          <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-12 flex items-center justify-center px-4">
                        <p className="truncate w-full text-center" style={{ fontSize: `${formData.text_size || 14}px` }}>
                          {formData.title || 'Memory Title'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <img 
                    src={selectedMemory?.image_url} 
                    alt={selectedMemory?.title}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>

              {/* Right Side: Info or Form */}
              <div className="w-full md:w-[400px] p-8 flex flex-col bg-[#111] overflow-hidden">
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
                          className="w-full py-4 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
                        >
                          <Save size={18} />
                          {isAdding ? 'Add to Web' : 'Save Changes'}
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
                        <p className="text-sm font-mono text-white/80">{selectedMemory && new Date(selectedMemory.timestamp).toLocaleString()}</p>
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
  parentX: any;
  parentY: any;
  onClick: () => void;
}

const MemoryCard: React.FC<MemoryCardProps> = ({ node, parentX, parentY, onClick }) => {
  const w = node.memory.card_width || 220;
  const h = node.memory.card_height || 280;
  const textSize = node.memory.text_size || 14;
  const fontFamily = node.memory.font_family || "'Caveat', cursive";
  const textColor = node.memory.text_color || '#000000';
  const bgColor = node.memory.bg_color || '#f8f8f8';
  const borderStyle = node.memory.border_style || 'none';
  const borderWidth = node.memory.border_width || 0;
  const borderColor = node.memory.border_color || '#000000';
  const shadowEffect = node.memory.shadow_effect || 'xl';
  const bgImageOverlay = node.memory.bg_image_overlay || '';

  const distance = useTransform(() => {
    const currentX = node.x + parentX.get() + w / 2;
    const currentY = node.y + parentY.get() + h / 2;
    return Math.sqrt(currentX * currentX + currentY * currentY);
  });

  const opacity = useTransform(distance, [0, 1200, 1800], [1, 0.8, 0]);
  const scale = useTransform(distance, [0, 1200, 1800], [1, 0.9, 0.5]);

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: w,
        height: h,
        opacity,
        scale,
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
            src={node.memory.image_url}
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

