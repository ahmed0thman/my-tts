'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, RotateCcw, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AudioPlayer } from '@/components/generation/audio-player';
import { pickRecorderMimeType, processAudioFile, type ProcessedRecording } from '@/lib/audio-encode';
import { formatDuration } from '@/lib/utils';

/**
 * Record a clip in the user's own voice for an episode or the library. Same
 * raw-audio capture as the voice-reference recorder (voice-recorder.tsx), but
 * without its script or its 10-second cap: this is content, not a reference.
 * Stops on its own at MAX_SECONDS.
 */

const MAX_SECONDS = 15 * 60;

interface ClipRecorderProps {
  onReady: (recording: ProcessedRecording | null) => void;
}

export function ClipRecorder({ onReady }: ClipRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [didClip, setDidClip] = useState(false);
  const [result, setResult] = useState<ProcessedRecording | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);

  const release = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    setLevel(0);
  }, []);

  // Never leave the mic open behind us.
  useEffect(
    () => () => {
      release();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [release],
  );

  const clear = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setResult(null);
    onReady(null);
  };

  const start = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('المتصفح ده مش بيدعم التسجيل الصوتي');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      clear();
      setDidClip(false);
      setElapsed(0);

      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        release();
        setIsProcessing(true);
        try {
          const processed = await processAudioFile(blob, { trim: true, normalize: true, fileName: 'recording.wav' });
          urlRef.current = processed.url;
          setResult(processed);
          onReady(processed);
        } catch (error) {
          console.error(error);
          toast.error('تعذّر تجهيز التسجيل، جرّب تاني');
        } finally {
          setIsProcessing(false);
        }
      };
      recorder.start(1000);
      setIsRecording(true);

      const context = new AudioContext();
      contextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
          sum += samples[i] * samples[i];
          peak = Math.max(peak, Math.abs(samples[i]));
        }
        setLevel(Math.sqrt(sum / samples.length));
        if (peak >= 0.99) setDidClip(true);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const seconds = (Date.now() - startedAt) / 1000;
        setElapsed(seconds);
        if (seconds >= MAX_SECONDS) stop();
      }, 200);
    } catch (error) {
      console.error(error);
      toast.error('مقدرناش نوصل للميكروفون — اتأكد إنك سمحت للتطبيق');
      release();
    }
  };

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setIsRecording(false);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        {isRecording ? (
          <Button type="button" variant="destructive" className="h-11 px-5" onClick={stop}>
            <Square className="h-3.5 w-3.5 fill-current" />
            إيقاف
          </Button>
        ) : (
          <Button type="button" className="h-11 px-5" onClick={() => void start()} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {isProcessing ? 'بنجهّز التسجيل...' : result ? 'سجّل من الأول' : 'ابدأ التسجيل'}
          </Button>
        )}
        {result && !isRecording && (
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={clear} title="امسح التسجيل">
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        <span dir="ltr" className="numeric ms-auto flex items-center gap-2 text-lg font-bold">
          {isRecording && <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />}
          {formatDuration(result ? result.duration : elapsed)}
        </span>
      </div>

      {isRecording && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">مستوى الصوت</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" dir="ltr">
            <div
              className={`h-full rounded-full transition-[width] duration-75 ${
                didClip ? 'bg-destructive' : level > 0.05 ? 'bg-success' : 'bg-muted-foreground/40'
              }`}
              style={{ width: `${Math.min(100, level * 320)}%` }}
            />
          </div>
        </div>
      )}
      {didClip && (
        <p className="text-[11px] text-destructive">الصوت عالي لدرجة إنه اتقطّع — بعّد عن الميكروفون شوية وسجّل تاني.</p>
      )}
      {!isRecording && !result && !isProcessing && (
        <p className="text-[11px] text-muted-foreground">
          الصمت في الأول والآخر بيتشال، والمستوى بيتظبط لوحده. أقصى مدة{' '}
          <span className="numeric">{MAX_SECONDS / 60}</span> دقيقة.
        </p>
      )}
      {result && <AudioPlayer src={result.url} compact />}
    </div>
  );
}
