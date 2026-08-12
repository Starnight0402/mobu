import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { compressImage } from '../lib/image';
import { useLightbox } from './Lightbox';
import { haptic } from '../lib/haptics';
import { Avatar, CoupleAvatars } from './Avatar';
import { Send, Image as ImageIcon, Mic, Square, Loader2, Play, Pause } from 'lucide-react';

export const ChatView: React.FC = () => {
  const messages = useQuery(api.messages.list) ?? [];
  const currentUser = useQuery(api.users.current);
  const partner = useQuery(api.users.partner);
  const sendMessage = useMutation(api.messages.send);
  const markRead = useMutation(api.messages.markRead);
  const react = useMutation(api.messages.react);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const { openGallery } = useLightbox();

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Opening the thread should land straight on the latest message, not
  // visibly scroll there — only messages that arrive after that get an
  // animated scroll.
  const hasSnappedRef = useRef(false);

  useEffect(() => {
    if (messages.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: hasSnappedRef.current ? 'smooth' : 'auto' });
    hasSnappedRef.current = true;
  }, [messages.length]);

  useEffect(() => {
    markRead();
  }, [messages.length, markRead]);

  const uploadBlob = async (blob: Blob): Promise<Id<'_storage'>> => {
    const uploadUrl = await generateUploadUrl();
    const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
    const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
    return storageId;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage({ text: text.trim() });
      setText('');
      haptic('tap');
    } finally {
      setSending(false);
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setSending(true);
    try {
      const blob = await compressImage(file, 1200, 0.8);
      const storageId = await uploadBlob(blob);
      await sendMessage({ imageStorageId: storageId });
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setSending(true);
        try {
          const storageId = await uploadBlob(blob);
          await sendMessage({ voiceStorageId: storageId });
        } finally {
          setSending(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      haptic('select');
    } catch (err) {
      console.error('Microphone access denied', err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const toggleHeart = (id: Id<'messages'>, current?: string | null) => {
    haptic('success');
    react({ id, reaction: current === '❤️' ? undefined : '❤️' });
  };

  // Every photo ever sent, so tapping one opens a swipeable thread gallery
  // rather than a dead end.
  const photos = messages
    .filter((m) => !!m.imageUrl)
    .map((m) => ({
      src: m.imageUrl as string,
      alt: 'Shared photo',
      subcaption: new Date(m._creationTime).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));

  return (
    <div className="flex flex-col">
      <header className="flex items-end justify-between mb-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-medium tracking-tight dot-matrix">Chat</h1>
          <p className="text-white/40 text-[10px] uppercase tracking-widest">Just the two of you</p>
        </div>
        <CoupleAvatars size={30} />
      </header>

      <div className="space-y-3 pr-1">
        {messages.length === 0 && (
          <div className="flex min-h-[45dvh] items-center justify-center text-white/20 text-xs uppercase tracking-widest">
            Say hi 👋
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.senderId === currentUser?._id;
          return (
            <div key={m._id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && <Avatar name={partner?.name} avatarUrl={partner?.avatarUrl} size={22} />}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onDoubleClick={() => toggleHeart(m._id, m.reaction)}
                className={`relative max-w-[75%] rounded-2xl px-4 py-2.5 cursor-pointer ${
                  isMe ? 'bg-nothing-purple text-white' : 'glass'
                }`}
              >
                {m.text && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>}
                {m.imageUrl && (
                  <button
                    type="button"
                    onClick={() => openGallery(photos, photos.findIndex((p) => p.src === m.imageUrl))}
                    className="mt-1 block w-full"
                    aria-label="Open photo"
                  >
                    <img
                      src={m.imageUrl}
                      alt="attachment"
                      className="rounded-xl max-w-full"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                )}
                {m.voiceUrl && <VoiceBubble url={m.voiceUrl} />}
                <p className={`text-[8px] mt-1 ${isMe ? 'text-white/60' : 'text-white/30'}`}>
                  {new Date(m._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <AnimatePresence>
                  {m.reaction && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute -bottom-2 -right-1 text-sm"
                    >
                      {m.reaction}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Sticky, not height-derived: pinning this to a computed "100dvh minus
          chrome" height broke across browser vs. WebView chrome sizing.
          Sticky just holds it at a fixed offset above the nav bar once
          scrolled content reaches it — no viewport-height math required. */}
      <form
        onSubmit={handleSend}
        className="glass sticky z-20 mt-4 flex items-center gap-2 p-2"
        style={{ bottom: 'max(6rem, calc(env(safe-area-inset-bottom) + 5rem))' }}
      >
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || recording}
          className="w-11 h-11 flex-shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-white/60 flex items-center justify-center transition-colors disabled:opacity-40"
        >
          <ImageIcon size={16} />
        </button>
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={sending}
          className={`w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${
            recording ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 hover:bg-white/10 text-white/60'
          }`}
        >
          {recording ? <Square size={14} /> : <Mic size={16} />}
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          disabled={sending || recording}
          /* min-w-0: flex items default to min-width:auto, which refuses to
             shrink below the placeholder/value's natural width — on Android
             that width can exceed the row and shove the send button off
             the visible screen. */
          className="nothing-input min-w-0 flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={sending || recording || !text.trim()}
          className="w-11 h-11 flex-shrink-0 rounded-full bg-nothing-purple text-white flex items-center justify-center hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
};

const VoiceBubble: React.FC<{ url: string }> = ({ url }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  return (
    <div className="flex items-center gap-2 mt-1">
      <button
        type="button"
        onClick={toggle}
        className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0"
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <span className="text-[10px] opacity-70">Voice note</span>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
};
