'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AudioPlayer } from '@/components/generation/audio-player';
import { Mic, Square, RotateCcw, Loader2, AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import {
  processRecording,
  pickRecorderMimeType,
  MIN_DURATION,
  MAX_DURATION,
  type ProcessedRecording,
} from '@/lib/audio-encode';
import {
  REFERENCE_SCRIPT_LINES,
  REFERENCE_SCRIPT_ESTIMATE,
  RECORDING_TIPS,
} from '@/lib/reference-script';
import { toast } from 'sonner';

/** The range that produces the best clones — long enough to carry prosody, short enough to stay consistent. */
const IDEAL_MIN = 12;
const IDEAL_MAX = 22;

interface VoiceRecorderProps {
  /** Fires whenever a finished WAV is ready, or null when the take is discarded. */
  onRecordingReady: (recording: ProcessedRecording | null) => void;
}

export function VoiceRecorder({ onRecordingReady }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [didClip, setDidClip] = useState(false);
  const [result, setResult] = useState<ProcessedRecording | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const releaseStream = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;

    setLevel(0);
  }, []);

  // Never leave the mic open behind us
  useEffect(() => {
    return () => {
      releaseStream();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [releaseStream]);

  const startMeter = (stream: MediaStream) => {
    const context = new AudioContext();
    audioContextRef.current = context;

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    const samples = new Float32Array(analyser.fftSize);

    const tick = () => {
      analyser.getFloatTimeDomainData(samples);

      let sumOfSquares = 0;
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        sumOfSquares += samples[i] * samples[i];
        const magnitude = Math.abs(samples[i]);
        if (magnitude > peak) peak = magnitude;
      }

      setLevel(Math.sqrt(sumOfSquares / samples.length));
      if (peak >= 0.99) setDidClip(true);

      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
  };

  const handleStart = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('المتصفح ده مش بيدعم التسجيل الصوتي');
      return;
    }

    try {
      // Browser voice processing fights voice cloning: AGC pumps the level and
      // noise suppression eats the timbre the model needs. Ask for raw audio.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];
      setDidClip(false);
      setElapsed(0);

      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
      setResult(null);
      onRecordingReady(null);

      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        releaseStream();

        setIsProcessing(true);
        try {
          const processed = await processRecording(blob);
          resultUrlRef.current = processed.url;
          setResult(processed);
          onRecordingReady(processed);
        } catch (error) {
          console.error(error);
          toast.error('تعذّر تجهيز التسجيل، جرّب تاني');
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      startMeter(stream);

      timerRef.current = setInterval(() => {
        setElapsed((previous) => {
          const next = previous + 0.1;
          // Hard stop at the engine's ceiling so the take is never rejected
          if (next >= MAX_DURATION) {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
          }
          return next;
        });
      }, 100);
    } catch (error) {
      console.error(error);
      toast.error('مقدرناش نوصل للميكروفون — اتأكد إنك سمحت للمتصفح');
      releaseStream();
    }
  };

  const handleStop = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleReset = () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResult(null);
    setElapsed(0);
    setDidClip(false);
    onRecordingReady(null);
  };

  const seconds = result ? result.duration : elapsed;
  const isTooShort = seconds < MIN_DURATION;
  const isIdeal = seconds >= IDEAL_MIN && seconds <= IDEAL_MAX;
  const progress = Math.min(100, (seconds / MAX_DURATION) * 100);

  return (
    <div className="space-y-4">
      {/* Teleprompter */}
      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold">اقرا الفقرة دي بصوت عالي</span>
          <Badge variant="outline" className="text-[10px]">{REFERENCE_SCRIPT_ESTIMATE}</Badge>
        </div>
        <ol className="space-y-2.5">
          {REFERENCE_SCRIPT_LINES.map((line, index) => (
            <li key={index} className="flex gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                {index + 1}
              </span>
              <p className="text-[15px] leading-8 font-medium">{line}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Transport */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          {!isRecording ? (
            <Button
              type="button"
              onClick={handleStart}
              disabled={isProcessing}
              className="h-11 gap-2 px-5 cursor-pointer"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {isProcessing ? 'بنجهّز التسجيل...' : result ? 'سجّل تاني' : 'ابدأ التسجيل'}
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={handleStop}
              className="h-11 gap-2 px-5 cursor-pointer"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              إيقاف
            </Button>
          )}

          {result && !isRecording && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleReset}
              className="h-11 w-11 cursor-pointer"
              title="مسح التسجيل"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}

          <div className="flex-1 text-left" dir="ltr">
            <span
              className={`font-mono text-lg font-bold tabular-nums ${
                isIdeal ? 'text-success' : isTooShort ? 'text-muted-foreground' : 'text-primary'
              }`}
            >
              {seconds.toFixed(1)}s
            </span>
            <span className="font-mono text-xs text-muted-foreground"> / {MAX_DURATION}s</span>
          </div>
        </div>

        {/* Duration track, with the sweet spot marked out */}
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" dir="ltr">
          <div
            className="absolute inset-y-0 bg-success/20"
            style={{
              left: `${(IDEAL_MIN / MAX_DURATION) * 100}%`,
              width: `${((IDEAL_MAX - IDEAL_MIN) / MAX_DURATION) * 100}%`,
            }}
          />
          <div
            className={`absolute inset-y-0 right-auto left-0 rounded-full transition-all ${
              isIdeal ? 'bg-success' : isTooShort ? 'bg-muted-foreground/40' : 'bg-primary'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Live input level */}
        {isRecording && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground shrink-0">مستوى الصوت</span>
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

        {/* Status line */}
        {result && (
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-2.5">
            {isTooShort ? (
              <>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <p className="text-[11px] leading-5">
                  التسجيل قصير أوي ({result.duration.toFixed(1)} ثانية). المحرك محتاج {MIN_DURATION} ثواني على الأقل —
                  اقرا الفقرة كاملة.
                </p>
              </>
            ) : didClip || result.inputPeak >= 0.99 ? (
              <>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <p className="text-[11px] leading-5">
                  الصوت كان عالي لدرجة إنه اتقطع. ابعد شوية عن الميكروفون وسجّل تاني عشان النتيجة تطلع أنضف.
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                <p className="text-[11px] leading-5">
                  التسجيل جاهز — {result.duration.toFixed(1)} ثانية، مونو، {result.sampleRate / 1000} كيلوهرتز.
                  {!isIdeal && ' الأفضل يكون بين ١٢ و ٢٢ ثانية.'}
                </p>
              </>
            )}
          </div>
        )}

        {result && <AudioPlayer src={result.url} />}
      </div>

      {/* Tips */}
      <details className="rounded-xl border bg-muted/20 px-4 py-3">
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-bold">
          <Lightbulb className="h-3.5 w-3.5 text-primary" />
          نصايح تخلّي الاستنساخ أدق
        </summary>
        <ul className="mt-3 space-y-1.5">
          {RECORDING_TIPS.map((tip, index) => (
            <li key={index} className="flex gap-2 text-[11px] leading-5 text-muted-foreground">
              <span className="text-primary">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
