import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '../lib/queryCache';
import type { FunctionReturnType } from 'convex/server';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { compressImage, UnreadableImageError } from '../lib/image';
import { useLightbox } from './Lightbox';
import { haptic } from '../lib/haptics';
import { goToTab, onRetapTab } from '../lib/navigation';
import { useBackHandler } from '../lib/backButtonStack';
import { Avatar, CoupleAvatars } from './Avatar';
import { BottomSheet } from './BottomSheet';
import {
  Send,
  Image as ImageIcon,
  Mic,
  Square,
  Loader2,
  Play,
  Pause,
  Check,
  CheckCheck,
  Phone,
  MoreVertical,
  Ban,
  Heart,
  Copy,
  Trash2,
  ArrowDown,
  Eraser,
  type LucideIcon,
} from 'lucide-react';

type Message = FunctionReturnType<typeof api.messages.list>['messages'][number];

/**
 * Long-press (touch) or right-click (mouse) on a message. One timer for the
 * whole list: only one finger can be pressing a bubble at a time. Moving the
 * finger (a scroll) cancels it, and the click that ends a long-press is
 * swallowed so it doesn't also open the photo underneath.
 */
function useLongPress<T>(onLongPress: (item: T) => void, ms = 450) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };
  return (item: T) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLongPress(item);
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // Android fires contextmenu on its own long-press; desktop on right-click.
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      cancel();
      if (!fired.current) {
        fired.current = true;
        onLongPress(item);
      }
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  });
}

const isAtBottom = () =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;

export const CHAT_PAGE = 200;
const PAGE = CHAT_PAGE;
const COARSE_POINTER = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export const formatDuration = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

export const ChatView: React.FC = () => {
  const [limit, setLimit] = useState(PAGE);
  const result = useQuery(api.messages.list, { limit });
  // A bigger limit is a new query that starts out undefined; keep showing the
  // last result meanwhile, or the thread would blank and lose its scroll.
  const lastResult = useRef(result);
  if (result !== undefined) lastResult.current = result;
  const shown = result ?? lastResult.current;
  const messages = shown?.messages ?? [];
  const hasMore = shown?.hasMore ?? false;
  const loadingEarlier = result === undefined && lastResult.current !== undefined;
  const currentUser = useQuery(api.users.current);
  const partner = useQuery(api.users.partner);
  const sendMessage = useMutation(api.messages.send);
  const markRead = useMutation(api.messages.markRead);
  const react = useMutation(api.messages.react);
  const deleteForEveryone = useMutation(api.messages.deleteForEveryone);
  const deleteForMe = useMutation(api.messages.deleteForMe);
  const clearChat = useMutation(api.messages.clearChat);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const { openGallery } = useLightbox();

  const [selected, setSelected] = useState<Message | null>(null);
  const [chatMenu, setChatMenu] = useState<'closed' | 'open' | 'confirm-clear'>('closed');
  const bindLongPress = useLongPress<Message>((m) => {
    haptic('select');
    setSelected(m);
  });

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [composerHeight, setComposerHeight] = useState(60);
  useEffect(() => {
    const el = formRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setComposerHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordStartRef = useRef(0);
  const cancelRecordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Opening the thread should land straight on the latest message, not
  // visibly scroll there — only messages that arrive after that get an
  // animated scroll.
  const hasSnappedRef = useRef(false);
  // Only follow new messages if you were already at the bottom; if you've
  // scrolled up to read something, a new message shouldn't yank you away from
  // it — a "New message" pill appears instead.
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const v = isAtBottom();
      atBottomRef.current = v;
      setAtBottom(v);
      if (v) setNewBelow(0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
    setNewBelow(0);
  };

  // Keyed on the newest message rather than the count, so deleting or
  // hiding an older message doesn't scroll anything.
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (!lastMessage) return;
    if (!hasSnappedRef.current) {
      scrollToLatest('auto');
      hasSnappedRef.current = true;
    } else if (atBottomRef.current || lastMessage.senderId === currentUser?._id) {
      scrollToLatest();
    } else {
      setNewBelow((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage?._id]);

  // Older messages go in above what you're reading; shift the scroll by
  // however much the page grew, so the message you were on stays put.
  const anchorRef = useRef<{ height: number; y: number } | null>(null);
  const loadEarlier = () => {
    anchorRef.current = { height: document.documentElement.scrollHeight, y: window.scrollY };
    setLimit((l) => l + PAGE);
  };
  const firstId = messages[0]?._id;
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || loadingEarlier) return;
    anchorRef.current = null;
    window.scrollTo(0, anchor.y + (document.documentElement.scrollHeight - anchor.height));
  }, [firstId, loadingEarlier]);

  // Re-tapping Chat in the bar jumps to the newest message rather than the top.
  useEffect(() => onRetapTab('chat', () => scrollToLatest()), []);

  // "Seen" must mean on screen: don't mark read while the app is in the
  // background, and catch up the moment it comes back.
  useEffect(() => {
    const markIfVisible = () => {
      if (document.visibilityState === 'visible') void markRead();
    };
    markIfVisible();
    document.addEventListener('visibilitychange', markIfVisible);
    return () => document.removeEventListener('visibilitychange', markIfVisible);
  }, [messages.length, markRead]);

  const uploadBlob = async (blob: Blob): Promise<Id<'_storage'>> => {
    const uploadUrl = await generateUploadUrl();
    const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
    return storageId;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage({ text: text.trim() });
      setText('');
      haptic('tap');
    } catch (err) {
      console.error('Send failed', err);
      setError("Message didn't send — tap send to retry.");
    } finally {
      setSending(false);
      // Keep the keyboard up so you can keep typing.
      inputRef.current?.focus();
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setSending(true);
    setError(null);
    try {
      const blob = await compressImage(file, 1200, 0.8);
      const storageId = await uploadBlob(blob);
      await sendMessage({ imageStorageId: storageId });
    } catch (err) {
      console.error('Photo send failed', err);
      setError(err instanceof UnreadableImageError ? err.message : "Couldn't send that photo — try again.");
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      setError(null);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const voiceDuration = (Date.now() - recordStartRef.current) / 1000;
        if (cancelRecordingRef.current) {
          cancelRecordingRef.current = false;
          return;
        }
        // Safari records mp4/aac, not webm — label the blob with what the
        // recorder actually produced or it won't play back.
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setSending(true);
        try {
          const storageId = await uploadBlob(blob);
          await sendMessage({ voiceStorageId: storageId, voiceDuration });
        } catch (err) {
          console.error('Voice note failed', err);
          setError("Couldn't send that voice note — try again.");
        } finally {
          setSending(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      recordStartRef.current = Date.now();
      setRecordSeconds(0);
      setRecording(true);
      haptic('select');
    } catch (err) {
      console.error('Microphone access denied', err);
      setError('Microphone access is blocked — allow it in your browser or app settings.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  /** Throws the recording away instead of sending it. */
  const cancelRecording = () => {
    cancelRecordingRef.current = true;
    haptic('tap');
    stopRecording();
  };

  // Ticking timer while recording, so you can see it's live and how long it is.
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(
      () => setRecordSeconds(Math.floor((Date.now() - recordStartRef.current) / 1000)),
      250,
    );
    return () => window.clearInterval(t);
  }, [recording]);

  // Leaving the screen mid-recording must not keep the microphone on.
  useEffect(
    () => () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        cancelRecordingRef.current = true;
        mediaRecorderRef.current.stop();
      }
    },
    [],
  );

  // The message box grows with what you type, up to about five lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // scrollHeight leaves out the border; add it back or a single line scrolls.
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + border, 128)}px`;
  }, [text]);

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Keyboard + mouse: Enter sends, Shift+Enter is a new line. On a phone,
    // Enter is a new line (as in other messaging apps) and the button sends.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !COARSE_POINTER) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const toggleHeart = (id: Id<'messages'>, current?: string | null) => {
    haptic('success');
    react({ id, reaction: current === '❤️' ? undefined : '❤️' });
  };

  /** Runs a menu action, closing the menu first so it feels instant. */
  const fromMenu = (action: () => Promise<unknown>, failure: string) => {
    setSelected(null);
    setChatMenu('closed');
    setError(null);
    action().catch((err) => {
      console.error(failure, err);
      setError(failure);
    });
  };

  const copyText = (value: string) =>
    fromMenu(async () => {
      await navigator.clipboard.writeText(value);
      haptic('tap');
    }, "Couldn't copy that message.");

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
          <p className="text-white/50 text-xs">Just the two of you</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToTab('call')}
            aria-label="Call"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface text-white"
          >
            <Phone size={18} />
          </button>
          <CoupleAvatars size={30} />
          <button
            type="button"
            onClick={() => setChatMenu('open')}
            aria-label="Chat options"
            className="flex h-11 w-9 items-center justify-center rounded-full text-white/60 hover:text-white"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </header>

      {/* Bottom padding tracks the composer's real height (it grows with
          multi-line messages) so the last message is never hidden behind it. */}
      <div
        className="space-y-3 pr-1"
        style={{ paddingBottom: `calc(max(6rem, calc(env(safe-area-inset-bottom) + 5rem)) + ${composerHeight + 12}px)` }}
      >
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={loadEarlier}
              disabled={loadingEarlier}
              className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-surface px-4 text-xs text-white/70 disabled:opacity-60"
            >
              {loadingEarlier && <Loader2 size={13} className="animate-spin" />}
              {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex min-h-[45dvh] items-center justify-center text-white/20 text-xs uppercase tracking-widest">
            Say hi 👋
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.senderId === currentUser?._id;
          const deleted = !!m.deletedAt;
          return (
            <div key={m._id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && <Avatar name={partner?.name} avatarUrl={partner?.avatarUrl} size={22} />}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                {...bindLongPress(m)}
                onDoubleClick={deleted ? undefined : () => toggleHeart(m._id, m.reaction)}
                /* select-none + no touch-callout: a long-press opens our menu
                   instead of the browser's text-selection handles. */
                className={`relative max-w-[75%] select-none rounded-2xl px-4 py-2.5 cursor-pointer transition-colors duration-500 [-webkit-touch-callout:none] ${
                  isMe && !deleted ? '' : 'glass'
                } ${selected?._id === m._id ? 'ring-2 ring-nothing-purple/60' : ''}`}
                style={
                  isMe && !deleted
                    ? { backgroundColor: `var(--bubble-${status(m)})`, color: `var(--bubble-${status(m)}-fg)` }
                    : undefined
                }
              >
                {deleted && (
                  <p className="flex items-center gap-1.5 text-sm italic text-white/40">
                    <Ban size={13} />
                    {isMe ? 'You deleted this message' : 'This message was deleted'}
                  </p>
                )}
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
                      draggable={false}
                    />
                  </button>
                )}
                {m.voiceUrl && <VoiceBubble url={m.voiceUrl} duration={m.voiceDuration} />}
                <p className={`text-[8px] mt-1 flex items-center gap-1 ${isMe ? 'opacity-75' : 'text-white/30'}`}>
                  {new Date(m._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {isMe && !deleted && (
                    <span className="inline-flex items-center gap-0.5" aria-label={STATUS_LABEL[status(m)]}>
                      {status(m) === 'sent' ? <Check size={11} /> : <CheckCheck size={11} />}
                      {STATUS_LABEL[status(m)]}
                    </span>
                  )}
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

      {/* Fixed, not height-derived or sticky: pinning this to a computed
          "100dvh minus chrome" height broke across browser vs. WebView
          chrome sizing, and `sticky` doesn't reliably clear the last
          message once you're scrolled to the true bottom of the page —
          fixed always sits at the same viewport offset, and the message
          list's own pb-40 reserves room for it to never overlap. */}
      <div
        className="fixed inset-x-0 z-20 px-4 sm:px-6"
        style={{ bottom: 'max(6rem, calc(env(safe-area-inset-bottom) + 5rem))' }}
      >
        <AnimatePresence>
          {!atBottom && messages.length > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              onClick={() => scrollToLatest()}
              aria-label={newBelow > 0 ? 'Jump to new messages' : 'Jump to latest'}
              className="mx-auto mb-2 flex h-9 w-fit items-center gap-1.5 rounded-full glass px-3 text-xs text-white/80 shadow-xl"
            >
              <ArrowDown size={14} />
              {newBelow > 0 && <span>{newBelow === 1 ? 'New message' : `${newBelow} new messages`}</span>}
            </motion.button>
          )}
        </AnimatePresence>
        {error && (
          <p role="alert" className="mx-auto mb-2 max-w-4xl rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
        {/* items-end: the buttons stay on the bottom line as the box grows. */}
        <form ref={formRef} onSubmit={handleSend} className="glass mx-auto flex max-w-4xl items-end gap-2 p-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
          {recording ? (
            <button
              type="button"
              onClick={cancelRecording}
              aria-label="Discard recording"
              className="w-11 h-11 flex-shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-white/70 flex items-center justify-center transition-colors"
            >
              <Trash2 size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              aria-label="Send a photo"
              className="w-11 h-11 flex-shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-white/60 flex items-center justify-center transition-colors disabled:opacity-40"
            >
              <ImageIcon size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={sending}
            aria-label={recording ? 'Stop and send voice note' : 'Record a voice note'}
            className={`w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${
              recording ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 hover:bg-white/10 text-white/60'
            }`}
          >
            {recording ? <Square size={14} /> : <Mic size={16} />}
          </button>
          {recording ? (
            <div
              role="status"
              className="flex h-11 min-w-0 flex-1 items-center gap-2 px-3 text-sm text-white/70"
            >
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="tabular-nums">{formatDuration(recordSeconds)}</span>
              <span className="truncate text-xs text-white/40">Tap ■ to send, 🗑 to discard</span>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Message…"
              ref={inputRef}
              rows={1}
              enterKeyHint={COARSE_POINTER ? 'enter' : 'send'}
              autoComplete="off"
              /* min-w-0: flex items default to min-width:auto, which refuses to
                 shrink below the placeholder/value's natural width — on Android
                 that width can exceed the row and shove the send button off
                 the visible screen. */
              className="nothing-input min-w-0 flex-1 resize-none text-sm leading-5 no-scrollbar"
            />
          )}
          <button
            type="submit"
            disabled={sending || recording || !text.trim()}
            aria-label="Send message"
            className="w-11 h-11 flex-shrink-0 rounded-full bg-nothing-purple text-white flex items-center justify-center hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>

      <AnimatePresence>
        {selected && (
          <ActionSheet key="message" label="Message options" onClose={() => setSelected(null)}>
            <p className="mb-3 line-clamp-2 px-1 text-sm text-white/50">
              {selected.deletedAt
                ? 'Deleted message'
                : selected.text ?? (selected.imageUrl ? '📷 Photo' : '🎤 Voice note')}
            </p>
            <div className="space-y-2">
              {!selected.deletedAt && (
                <SheetAction
                  icon={Heart}
                  label={selected.reaction === '❤️' ? 'Remove heart' : 'Heart'}
                  onClick={() => fromMenu(async () => toggleHeart(selected._id, selected.reaction), "Couldn't react to that message.")}
                />
              )}
              {selected.text && (
                <SheetAction icon={Copy} label="Copy text" onClick={() => copyText(selected.text!)} />
              )}
              {selected.senderId === currentUser?._id && !selected.deletedAt && (
                <SheetAction
                  icon={Trash2}
                  danger
                  label="Delete for everyone"
                  hint={`Removes it for you and ${partner?.name ?? 'your partner'}`}
                  onClick={() =>
                    fromMenu(() => deleteForEveryone({ id: selected._id }), "Couldn't delete that message — try again.")
                  }
                />
              )}
              <SheetAction
                icon={Trash2}
                danger
                label="Delete for me"
                hint="Only hides it on your side"
                onClick={() => fromMenu(() => deleteForMe({ id: selected._id }), "Couldn't delete that message — try again.")}
              />
            </div>
          </ActionSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chatMenu !== 'closed' && (
          <ActionSheet key="chat" label="Chat options" onClose={() => setChatMenu('closed')}>
            {chatMenu === 'open' ? (
              <div className="space-y-2">
                <SheetAction
                  icon={Eraser}
                  danger
                  label="Clear chat"
                  hint="Hide every message so far, on your side only"
                  onClick={() => setChatMenu('confirm-clear')}
                />
              </div>
            ) : (
              <div className="space-y-4 px-1">
                <div className="space-y-1">
                  <h2 className="text-xl font-medium">Clear this chat?</h2>
                  <p className="text-sm text-white/50">
                    Every message so far disappears for you. {partner?.name ?? 'Your partner'} keeps their copy, and new
                    messages still come through. This can't be undone.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setChatMenu('closed')}
                    className="min-h-[48px] flex-1 rounded-2xl border border-white/10 bg-surface text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => fromMenu(() => clearChat(), "Couldn't clear the chat — try again.")}
                    className="min-h-[48px] flex-1 rounded-2xl bg-red-500 text-sm font-medium text-white"
                  >
                    Clear chat
                  </button>
                </div>
              </div>
            )}
          </ActionSheet>
        )}
      </AnimatePresence>
    </div>
  );
};

/** The app's bottom sheet, closed by Back too. */
const ActionSheet: React.FC<{ label: string; onClose: () => void; children: React.ReactNode }> = ({
  label,
  onClose,
  children,
}) => {
  useBackHandler(true, onClose);
  return (
    <BottomSheet label={label} onClose={onClose}>
      {children}
    </BottomSheet>
  );
};

const SheetAction: React.FC<{
  icon: LucideIcon;
  label: string;
  hint?: string;
  danger?: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, hint, danger, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-[56px] w-full items-center gap-4 rounded-2xl border border-white/8 bg-surface px-4 py-3 text-left transition-colors hover:bg-raised active:scale-[0.99]"
  >
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
        danger ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-white/80'
      }`}
    >
      <Icon size={18} />
    </span>
    <span className="flex-1">
      <span className={`block text-[15px] font-medium ${danger ? 'text-red-400' : ''}`}>{label}</span>
      {hint && <span className="block text-xs text-white/50">{hint}</span>}
    </span>
  </button>
);

type Status = 'sent' | 'delivered' | 'seen';
const STATUS_LABEL: Record<Status, string> = { sent: 'Sent', delivered: 'Delivered', seen: 'Seen' };
const status = (m: { readAt?: number; deliveredAt?: number }): Status =>
  m.readAt ? 'seen' : m.deliveredAt ? 'delivered' : 'sent';

// One voice note at a time: starting another pauses the one playing.
let playingAudio: HTMLAudioElement | null = null;

const VoiceBubble: React.FC<{ url: string; duration?: number }> = ({ url, duration }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  // Prefer the length measured while recording; older notes fall back to the
  // file's own metadata when the browser can read it (Chrome's webm often can't).
  const [total, setTotal] = useState(duration ?? 0);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      if (playingAudio && playingAudio !== audio) playingAudio.pause();
      playingAudio = audio;
      void audio.play();
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * total;
    setCurrent(audio.currentTime);
  };

  const progress = total ? Math.min(current / total, 1) : 0;

  return (
    <div className="mt-1 flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20"
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      {/* Tall hit area around a thin bar: tap anywhere along it to jump there. */}
      <div onClick={seek} className="flex h-8 w-28 cursor-pointer items-center" aria-hidden>
        <div className="h-1 w-full overflow-hidden rounded-full bg-current/20">
          <div className="h-full rounded-full bg-current/80" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <span className="w-8 text-[10px] tabular-nums opacity-70">
        {total || current ? formatDuration(playing || current > 0 ? current : total) : '—'}
      </span>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (!duration && Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        className="hidden"
      />
    </div>
  );
};
