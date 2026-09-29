'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** A play/pause button for a stored clip, for lists where a full player would not fit. */
export function ClipPreviewButton({ audioPath }: { audioPath: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const toggle = () => {
    if (!audioRef.current) {
      const audio = new Audio(`/api/audio/${audioPath.replace(/^\/?storage\//, '')}`);
      audio.onended = () => setPlaying(false);
      audio.onpause = () => setPlaying(false);
      audio.onplay = () => setPlaying(true);
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (audio.paused) {
      // One preview at a time.
      document.dispatchEvent(new CustomEvent('sawtak:preview', { detail: audio }));
      void audio.play();
    } else {
      audio.pause();
    }
  };

  useEffect(() => {
    const onOther = (event: Event) => {
      if ((event as CustomEvent).detail !== audioRef.current) audioRef.current?.pause();
    };
    document.addEventListener('sawtak:preview', onOther);
    return () => document.removeEventListener('sawtak:preview', onOther);
  }, []);

  return (
    <Button
      type="button"
      variant={playing ? 'default' : 'outline'}
      size="icon-sm"
      className="shrink-0 rounded-full"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      aria-label={playing ? 'إيقاف' : 'تشغيل'}
    >
      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-px" />}
    </Button>
  );
}
