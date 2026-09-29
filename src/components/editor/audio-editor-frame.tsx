'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * AudioMass, embedded. The editor is a vendored standalone app under
 * public/audio-editor/ (see SAWTAK.md there); this component hosts it in a
 * same-origin iframe and speaks the postMessage protocol documented in
 * public/audio-editor/sawtak-bridge.js.
 *
 * An iframe rather than mounting its scripts into the page: AudioMass is
 * global-variable JavaScript with its own stylesheet and keyboard handling,
 * and isolation keeps all of that away from React, Tailwind and the app's
 * shortcuts. Colors still match — the app's theme tokens are sent in and
 * mapped onto AudioMass's own CSS variables.
 */

/** Options for the voice polish preset — see public/audio-editor/sawtak-voice.js. */
export interface EnhanceOptions {
  preset: 'deep' | 'clear';
  denoise: boolean;
  breaths: boolean;
  tone: boolean;
  deess: boolean;
  compress: boolean;
  loudness: boolean;
  /** dBFS peak, as read off the editor's dB axis; quieter sound is erased (letters' edges are protected). */
  gateThresholdDb: number;
  /** Also erase breath-like sound above the threshold. Can take ح / ه with it. */
  removeBreaths: boolean;
}

export interface EnhanceReport {
  inputLufs: number;
  outputLufs: number;
  peakDb: number;
  steps: string[];
  breathSeconds?: number;
  ms: number;
}

/** What volume / speed edits act on: the selection, or the whole file when nothing is selected. */
export interface EditorSelection {
  start: number;
  end: number;
  whole: boolean;
  /** Loudest sample in the range, dBFS — the headroom a volume boost has. */
  peakDb: number;
}

export interface AudioEditorHandle {
  /** Render the current edit to a mono float32 WAV. */
  exportWav: () => Promise<Blob>;
  /** Run the voice polish preset over the whole file, as one undo step. */
  enhance: (options: EnhanceOptions) => Promise<EnhanceReport>;
  /** Volume (dB) or pitch-preserving speed on the selection, as one undo step. Resolves to the new duration. */
  applyEdit: (edit: { gainDb: number } | { speed: number }) => Promise<number>;
}

interface AudioEditorFrameProps {
  /** `/api/audio/...` URL of the file to open. Changing it reloads the editor's audio. */
  src: string;
  onLoaded?: (duration: number) => void;
  onDirty?: () => void;
  onError?: (message: string) => void;
  onSelection?: (selection: EditorSelection) => void;
}

/** App tokens the bridge maps onto AudioMass's palette. */
const TOKENS = {
  background: '--background',
  card: '--card',
  elevated: '--elevated',
  secondary: '--secondary',
  border: '--border',
  borderStrong: '--border-strong',
  foreground: '--foreground',
  mutedForeground: '--muted-foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  destructive: '--destructive',
  success: '--success',
} as const;

function readTokens() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(TOKENS).map(([key, cssVar]) => [key, style.getPropertyValue(cssVar).trim()]),
  );
}

/** Replies the bridge sends to a request, keyed by message type. */
type ReplyType = 'sawtak:exported' | 'sawtak:enhanced' | 'sawtak:edited';
type Pending = { resolve: (msg: any) => void; reject: (error: Error) => void };

export const AudioEditorFrame = forwardRef<AudioEditorHandle, AudioEditorFrameProps>(function AudioEditorFrame(
  { src, onLoaded, onDirty, onError, onSelection },
  ref,
) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  // One outstanding request per reply type; a newer one supersedes it.
  const pending = useRef(new Map<ReplyType, Pending>());

  // Latest callbacks without re-subscribing the message listener.
  const handlers = useRef({ onLoaded, onDirty, onError, onSelection });
  handlers.current = { onLoaded, onDirty, onError, onSelection };

  const send = useCallback((message: unknown, transfer: Transferable[] = []) => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin, transfer);
  }, []);

  const request = useCallback(
    <T,>(reply: ReplyType, message: unknown, pick: (msg: any) => T) =>
      new Promise<T>((resolve, reject) => {
        if (!ready.current) return reject(new Error('المحرر لسه بيحمّل'));
        pending.current.get(reply)?.reject(new Error('superseded'));
        pending.current.set(reply, { resolve: (msg) => resolve(pick(msg)), reject });
        send(message);
      }),
    [send],
  );

  const sendTheme = useCallback(() => {
    if (!ready.current) return;
    send({ type: 'sawtak:theme', tokens: readTokens(), dark: document.documentElement.classList.contains('dark') });
  }, [send]);

  const loadAudio = useCallback(async () => {
    if (!ready.current) return;
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      send({ type: 'sawtak:load', buffer, name: 'audio.wav' }, [buffer]);
    } catch (error: any) {
      handlers.current.onError?.(`تعذّر تحميل الصوت: ${error?.message ?? error}`);
    }
  }, [src, send]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data ?? {};
      const waiting = pending.current.get(msg.type);
      if (waiting) {
        pending.current.delete(msg.type);
        waiting.resolve(msg);
        return;
      }
      switch (msg.type) {
        case 'sawtak:ready':
          ready.current = true;
          sendTheme();
          void loadAudio();
          break;
        case 'sawtak:loaded':
          // The waveform is drawn by now; recolor it.
          sendTheme();
          handlers.current.onLoaded?.(msg.duration ?? 0);
          break;
        case 'sawtak:selection':
          handlers.current.onSelection?.({ start: msg.start, end: msg.end, whole: msg.whole, peakDb: msg.peakDb });
          break;
        case 'sawtak:dirty':
          handlers.current.onDirty?.();
          break;
        case 'sawtak:notice':
          handlers.current.onError?.(msg.message);
          break;
        case 'sawtak:error':
          if (pending.current.size > 0) {
            pending.current.forEach((p) => p.reject(new Error(msg.message)));
            pending.current.clear();
          } else {
            handlers.current.onError?.(msg.message);
          }
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadAudio, sendTheme]);

  // A new file for the same editor instance (e.g. after navigating to another segment).
  useEffect(() => {
    void loadAudio();
  }, [loadAudio]);

  // Follow theme switches. Watched on <html> itself rather than through
  // next-themes' state: that state updates before the class does, so tokens
  // read on it are still the previous theme's.
  useEffect(() => {
    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, [sendTheme]);

  useImperativeHandle(
    ref,
    () => ({
      exportWav: () => request('sawtak:exported', { type: 'sawtak:export' }, (msg) => msg.blob as Blob),
      enhance: (options) =>
        request('sawtak:enhanced', { type: 'sawtak:enhance', options }, (msg) => msg.report as EnhanceReport),
      applyEdit: (edit) => request('sawtak:edited', { type: 'sawtak:edit', ...edit }, (msg) => msg.duration as number),
    }),
    [request, send],
  );

  return (
    <iframe
      ref={frameRef}
      src="/audio-editor/index.html"
      title="محرر الصوت"
      // The editor is LTR (timeline, transport); the page around it stays RTL.
      dir="ltr"
      className="h-full w-full rounded-2xl border border-border bg-background"
      allow="autoplay; microphone"
    />
  );
});
