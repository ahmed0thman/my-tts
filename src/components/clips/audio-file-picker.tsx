'use client';

import { useEffect, useRef, useState } from 'react';
import { FileAudio, Loader2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AudioPlayer } from '@/components/generation/audio-player';
import { processAudioFile, type ProcessedRecording } from '@/lib/audio-encode';
import { cn, formatDuration } from '@/lib/utils';

/**
 * Pick an audio file (WAV, MP3, M4A — whatever the browser decodes), convert
 * it to mono 24 kHz in the browser, and preview it. The level and silences are
 * kept as they are: an outro or a jingle is made that way on purpose.
 */

interface AudioFilePickerProps {
  /** The processed audio and the file's name without its extension. */
  onReady: (audio: ProcessedRecording | null, name?: string) => void;
}

export function AudioFilePicker({ onReady }: AudioFilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [picked, setPicked] = useState<{ name: string; audio: ProcessedRecording } | null>(null);

  useEffect(() => () => void (picked && URL.revokeObjectURL(picked.audio.url)), [picked]);

  const handle = async (file: File) => {
    setIsProcessing(true);
    try {
      const audio = await processAudioFile(file, { fileName: 'upload.wav' });
      const name = file.name.replace(/\.[^.]+$/, '');
      setPicked({ name: file.name, audio });
      onReady(audio, name);
    } catch (error) {
      console.error(error);
      toast.error('الملف ده مش صوت يتقري — جرّب WAV أو MP3 أو M4A');
    } finally {
      setIsProcessing(false);
    }
  };

  if (picked) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3">
          <FileAudio className="h-4 w-4 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-1 flex-col text-sm">
            <span className="truncate font-semibold" title={picked.name} dir="auto">
              {picked.name}
            </span>
            <span className="numeric text-xs text-muted-foreground">{formatDuration(picked.audio.duration)}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="شيل الملف"
            onClick={() => {
              setPicked(null);
              onReady(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <AudioPlayer src={picked.audio.url} compact />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors duration-150',
        isDragging ? 'border-primary bg-primary/10' : 'border-border-strong hover:border-primary/50 hover:bg-muted/50',
      )}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handle(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
          e.target.value = '';
        }}
      />
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
          {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
        </span>
        <p className="text-sm font-bold text-foreground">{isProcessing ? 'بنجهّز الملف...' : 'اسحب ملف صوت هنا'}</p>
        <p className="text-xs">
          أو دوس عشان تختار · <span dir="ltr">WAV · MP3 · M4A</span>
        </p>
      </div>
    </div>
  );
}
