'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2, VolumeX, Copy, Check, RotateCcw, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration } from '@/lib/utils';
import { toast } from 'sonner';

interface AudioPlayerProps {
  src: string | null;
  isLoading?: boolean;
  /**
   * Drops the secondary transport controls. Use inside narrow containers —
   * the full control cluster cannot fit under ~360px and used to overflow
   * its card.
   */
  compact?: boolean;
}

const PLAYBACK_RATES = [1, 1.25, 1.5, 2];

export function AudioPlayer({ src, isLoading, compact = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration || 0);
      setCurrentTime(audio.currentTime || 0);
    };

    const setAudioTime = () => setCurrentTime(audio.currentTime || 0);
    const setAudioEnd = () => setIsPlaying(false);

    audio.addEventListener('loadeddata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', setAudioEnd);

    return () => {
      audio.removeEventListener('loadeddata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', setAudioEnd);
    };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.playbackRate = playbackRate;
    }
  }, [volume, isMuted, playbackRate]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const cycleSpeed = () => {
    const nextIdx = (PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length;
    const nextRate = PLAYBACK_RATES[nextIdx];
    setPlaybackRate(nextRate);
    toast.info(`سرعة التشغيل: ${nextRate}x`);
  };

  const restartAudio = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleCopyLink = async () => {
    if (!src) return;
    try {
      const fullUrl = window.location.origin + src;
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success('تم نسخ رابط الملف الصوتي');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('فشل في نسخ الرابط');
    }
  };

  const handleDownload = async () => {
    if (!src) return;
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `ahmed-tts-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('بدأ تحميل الملف الصوتي (WAV نقية)');
    } catch (error) {
      console.error('Download failed', error);
      toast.error('فشل تحميل الملف الصوتي');
    }
  };

  if (isLoading) {
    return (
      <div
        id="tour-audio-player"
        className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-5"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-40 rounded" />
            <Skeleton className="h-1.5 w-full rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" />
          <span>جاري معالجة وتوليد الصوت...</span>
        </div>
      </div>
    );
  }

  if (!src) {
    return (
      <div
        id="tour-audio-player"
        className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-card/40 px-6 py-10 text-center"
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
          <Headphones className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">استوديو الاستماع الصوتي</p>
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
            اكتب النص واضغط على &ldquo;توليد الصوت&rdquo; لتستمع إلى النتيجة هنا بصيغة WAV
            نقية مع خيارات التسريع والتحميل.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      id="tour-audio-player"
      className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-plate sm:p-4"
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Transport is inherently LTR: play runs left-to-right regardless of
          the surrounding Arabic layout. */}
      <div className="flex w-full min-w-0 items-center gap-3" dir="ltr">
        <Button
          type="button"
          variant="default"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          onClick={togglePlayPause}
          aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-px" />}
        </Button>

        {/* min-w-0 is what stops this track from forcing the row wider than
            the card — without it the controls bled outside the border. */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="numeric w-10 shrink-0 text-end text-[11px] text-muted-foreground">
            {formatDuration(currentTime)}
          </span>
          <Slider
            value={[currentTime]}
            max={duration > 0 ? duration : 100}
            step={0.05}
            onValueChange={handleSeek}
            aria-label="موضع التشغيل"
            className="min-w-0 flex-1"
          />
          <span className="numeric w-10 shrink-0 text-[11px] text-muted-foreground">
            {formatDuration(duration)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!compact && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={restartAudio}
                title="إعادة من البداية"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="numeric px-2 font-semibold"
                onClick={cycleSpeed}
                title="سرعة التشغيل"
              >
                {playbackRate}x
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsMuted(!isMuted)}
                aria-label={isMuted ? 'إلغاء الكتم' : 'كتم الصوت'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>

              <div className="hidden w-16 lg:block">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  max={1}
                  step={0.02}
                  aria-label="مستوى الصوت"
                  onValueChange={(val) => {
                    setVolume(val[0]);
                    if (val[0] > 0) setIsMuted(false);
                  }}
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleCopyLink}
                title="نسخ الرابط"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleDownload}
            title="تحميل ملف الصوت"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{compact ? '' : 'تحميل WAV'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
