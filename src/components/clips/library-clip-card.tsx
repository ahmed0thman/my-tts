'use client';

import { useState } from 'react';
import { Check, FileAudio, Library, Mic, Pencil, Trash2, X } from 'lucide-react';
import { AudioPlayer } from '@/components/generation/audio-player';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/providers/confirm-provider';
import { useDeleteClip, useRenameClip, type LibraryClip } from '@/hooks/use-clips';
import { formatDate, formatDuration } from '@/lib/utils';

const SOURCES = {
  upload: { label: 'ملف', icon: FileAudio },
  recording: { label: 'تسجيل', icon: Mic },
  segment: { label: 'من مقطع', icon: Library },
} as const;

export function LibraryClipCard({ clip }: { clip: LibraryClip }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(clip.name);
  const rename = useRenameClip();
  const remove = useDeleteClip();
  const confirm = useConfirm();
  const source = SOURCES[clip.source as keyof typeof SOURCES] ?? SOURCES.upload;

  const saveName = () => {
    const next = name.trim();
    if (!next || next === clip.name) return setEditing(false);
    rename.mutate({ id: clip.id, name: next }, { onSuccess: () => setEditing(false) });
  };

  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start gap-2">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus dir="auto" className="h-8" />
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="احفظ الاسم" disabled={rename.isPending}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="إلغاء"
              onClick={() => {
                setName(clip.name);
                setEditing(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <>
            <h3 className="min-w-0 flex-1 truncate text-sm font-bold leading-8" dir="auto" title={clip.name}>
              {clip.name}
            </h3>
            <Button variant="ghost" size="icon-sm" title="غيّر الاسم" aria-label="غيّر الاسم" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hover:bg-destructive/10 hover:text-destructive"
              title="امسح من المكتبة"
              aria-label="امسح من المكتبة"
              disabled={remove.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: `تمسح «${clip.name}» من المكتبة؟`,
                    description: 'الحلقات اللي استخدمته بتحتفظ بنسختها، مش هتتأثر.',
                    confirmLabel: 'امسح',
                    destructive: true,
                  })
                ) {
                  remove.mutate(clip.id);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">
          <source.icon />
          {source.label}
        </Badge>
        <Badge variant="outline">
          <span className="numeric">{formatDuration(clip.duration)}</span>
        </Badge>
        <span className="bidi-isolate ms-auto text-[11px] text-muted-foreground">{formatDate(clip.createdAt)}</span>
      </div>
      <div className="mt-auto">
        <AudioPlayer src={`/api/audio/${clip.audioPath}`} compact />
      </div>
    </article>
  );
}
