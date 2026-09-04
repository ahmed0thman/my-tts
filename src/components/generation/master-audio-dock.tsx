'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Download,
  Volume2,
  VolumeX,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  FastForward,
  Waves,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { formatDuration } from '@/lib/utils';
import { toast } from 'sonner';

interface MasterAudioDockProps {
  src: string | null;
  text?: string;
  onClose?: () => void;
}

const SPEED_OPTIONS = [0.8, 1.0, 1.25, 1.5, 2.0];

export function MasterAudioDock({ src, text, onClose }: MasterAudioDockProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
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

    // Autoplay when a new audio is loaded
    audio.play().then(() => setIsPlaying(true)).catch(() => {});

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

  const handleRestart = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      audioRef.current.play();
      setIsPlaying(true);
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
      a.download = `namaa-tts-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('تم تحميل الملف الصوتي (24kHz HiFi WAV)');
    } catch {
      toast.error('فشل تحميل الملف الصوتي');
    }
  };

  if (!src) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 max-w-4xl mx-auto z-40 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="p-3.5 sm:p-4 rounded-2xl bg-card/95 backdrop-blur-2xl border border-primary/30 shadow-2xl shadow-primary/10 flex flex-col gap-3">
        {/* Top Info Bar */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <Badge variant="secondary" className="text-[10px] font-mono gap-1 px-2 py-0.5">
              <Waves className="h-3 w-3 text-primary" />
              24kHz WAV Lossless
            </Badge>
            {text && (
              <span className="text-muted-foreground truncate max-w-xs sm:max-w-md text-xs font-medium" dir="rtl">
                &ldquo;{text}&rdquo;
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main Controls Dock */}
        <div className="flex items-center gap-3 md:gap-4 w-full" dir="ltr">
          {/* Main Play Button with Pulse Aura */}
          <Button
            type="button"
            variant="default"
            size="icon"
            onClick={togglePlayPause}
            className="h-11 w-11 sm:h-12 sm:w-12 rounded-full shrink-0 shadow-lg shadow-primary/25 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </Button>

          {/* Time & Scrubber */}
          <div className="flex-1 space-y-1">
            <Slider
              value={[currentTime]}
              max={duration > 0 ? duration : 100}
              step={0.05}
              onValueChange={handleSeek}
              className="w-full cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-muted-foreground px-0.5">
              <span>{formatDuration(currentTime)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Secondary Actions */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Restart */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleRestart}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="إعادة من البداية"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>

            {/* Speed Pills */}
            <div className="hidden sm:flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg border border-border/40">
              {SPEED_OPTIONS.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setPlaybackRate(rate)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                    playbackRate === rate
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Mute Toggle */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsMuted(!isMuted)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>

            {/* Volume Slider (desktop) */}
            <div className="w-14 hidden lg:block">
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.02}
                onValueChange={(val) => {
                  setVolume(val[0]);
                  if (val[0] > 0) setIsMuted(false);
                }}
                className="cursor-pointer"
              />
            </div>

            {/* Copy Link */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCopyLink}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="نسخ الرابط"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>

            {/* Lossless Download */}
            <Button
              type="button"
              size="sm"
              onClick={handleDownload}
              className="h-8 px-3 gap-1.5 text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">تحميل WAV</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
