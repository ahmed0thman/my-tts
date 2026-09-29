'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getEditTarget, type EditKind } from '@/actions/editor';
import {
  AudioEditorFrame,
  type AudioEditorHandle,
  type EditorSelection,
  type EnhanceOptions,
} from '@/components/editor/audio-editor-frame';
import { SelectionTools } from '@/components/editor/selection-tools';
import { EnhanceDialog } from '@/components/editor/enhance-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/providers/confirm-provider';
import { formatDuration } from '@/lib/utils';

/**
 * The audio editor: `/editor?segment=<generationId>` edits one take,
 * `/editor?episode=<episodeId>` edits an episode's merged file. Saving writes
 * a new file and swaps the row over (see src/app/api/edits/route.ts).
 */
export default function EditorPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[70vh] rounded-2xl" />}>
      <Editor />
    </Suspense>
  );
}

function Editor() {
  const params = useSearchParams();
  const kind: EditKind | null = params.get('segment') ? 'segment' : params.get('episode') ? 'episode' : null;
  const id = (kind && params.get(kind)) || '';

  const { data: target, isLoading, error } = useQuery({
    queryKey: ['edit-target', kind, id],
    queryFn: async () => {
      const result = await getEditTarget(kind!, id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: !!kind && !!id,
    // Read fresh on every open: a re-merge or retake since the last visit
    // points the row at a new file, and a cached target reopened the old one.
    // Within a visit, a save moves the page's own copy forward instead.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  if (!kind || !id) return <Missing message="مفيش صوت محدد للتعديل" />;
  if (isLoading) return <Skeleton className="h-[70vh] rounded-2xl" />;
  if (error || !target) return <Missing message={error?.message ?? 'الصوت مش موجود'} />;

  // Keyed on the file too, so a different file never inherits the previous one's state.
  return <Workspace key={`${kind}:${id}:${target.audioPath}`} target={target} />;
}

function Missing({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link href="/projects">المشاريع</Link>
      </Button>
    </div>
  );
}

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
}

type Target = NonNullable<Extract<Awaited<ReturnType<typeof getEditTarget>>, { success: true }>['data']>;

function Workspace({ target }: { target: Target }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const editor = useRef<AudioEditorHandle>(null);
  const confirm = useConfirm();

  // The file the editor opened. A save moves it forward, and the server
  // refuses a save whose starting file is no longer the row's.
  const [audioPath, setAudioPath] = useState(target.audioPath);
  const [duration, setDuration] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  // A save here makes the open file an edited one, stamped now.
  const [version, setVersion] = useState(target.version);
  const [selection, setSelection] = useState<EditorSelection | null>(null);

  const applyEdit = async (edit: { gainDb: number } | { speed: number }) => {
    try {
      const seconds = await editor.current!.applyEdit(edit);
      setDuration(seconds);
      setIsDirty(true);
    } catch (error: any) {
      toast.error(`فشل التعديل: ${error?.message ?? error}`);
    }
  };

  const enhance = async (options: EnhanceOptions) => {
    setIsEnhancing(true);
    try {
      const report = await editor.current!.enhance(options);
      setIsDirty(true);
      toast.success('اتحسّن الصوت', {
        description: (
          <>
            العلو بقى{' '}
            <span dir="ltr" className="numeric">
              {report.outputLufs.toFixed(1)} LUFS
            </span>{' '}
            (كان{' '}
            <span dir="ltr" className="numeric">
              {report.inputLufs.toFixed(1)}
            </span>
            ). متحفظش لسه — اسمعه واحفظ، أو ارجع بـ <span dir="ltr">⌘Z</span>.
          </>
        ),
      });
    } catch (error: any) {
      toast.error(`فشل التحسين: ${error?.message ?? error}`);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Leaving with unsaved edits loses them; say so.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const leave = async () => {
    if (
      isDirty &&
      !(await confirm({
        title: 'تخرج من غير ما تحفظ؟',
        description: 'فيه تعديلات مش محفوظة، ولو خرجت هتضيع.',
        confirmLabel: 'اخرج من غير حفظ',
        cancelLabel: 'ارجع للمحرر',
        destructive: true,
      }))
    )
      return;
    router.push(target.backHref);
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const wav = await editor.current!.exportWav();
      const form = new FormData();
      form.append('kind', target.kind);
      form.append('id', target.id);
      form.append('expectedAudioPath', audioPath);
      form.append('file', wav, 'edit.wav');

      const response = await fetch('/api/edits', { method: 'POST', body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);

      setAudioPath(body.audioPath);
      setDuration(body.duration ?? null);
      setIsDirty(false);
      setVersion({ edited: true, at: new Date() });
      queryClient.invalidateQueries({ queryKey: ['episode'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      toast.success('اتحفظ التعديل', {
        description: target.kind === 'episode' ? 'الملف المدموج اتبدّل بالنسخة المتعدّلة' : 'المقطع اتبدّل بالنسخة المتعدّلة',
      });
    } catch (error: any) {
      toast.error(`فشل الحفظ: ${error?.message ?? error}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[560px] flex-col gap-4 lg:h-[calc(100dvh-8rem)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <button
            type="button"
            onClick={leave}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {target.subtitle}
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-lg font-extrabold tracking-tight sm:text-xl" title={target.title}>
              {target.title}
            </h1>
            {duration != null && (
              <Badge variant="outline" className="shrink-0">
                <span className="numeric">{formatDuration(duration)}</span>
              </Badge>
            )}
            <Badge
              variant={version.edited ? 'accent' : 'outline'}
              className="shrink-0"
              title={version.edited ? 'آخر نسخة اتحفظت من المحرر' : target.kind === 'episode' ? 'الملف زي ما الدمج عمله' : 'المقطع زي ما اتولّد'}
            >
              {version.edited ? 'متعدّل ومحفوظ' : target.kind === 'episode' ? 'اتدمج' : 'أصلي'}
              {version.at && <span className="numeric">{formatTime(version.at)}</span>}
            </Badge>
            {isDirty && (
              <Badge variant="accent" className="shrink-0">
                مش محفوظ
              </Badge>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={leave} disabled={isSaving}>
            رجوع
          </Button>
          <EnhanceDialog disabled={!isLoaded || isSaving} isRunning={isEnhancing} onApply={enhance} />
          <Button size="sm" onClick={save} disabled={isSaving || isEnhancing || !isDirty}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            حفظ
          </Button>
        </div>
      </header>

      <SelectionTools selection={selection} disabled={!isLoaded || isSaving || isEnhancing} onApply={applyEdit} />

      <div className="min-h-0 flex-1">
        <AudioEditorFrame
          ref={editor}
          src={`/api/audio/${target.audioPath}`}
          onLoaded={(seconds) => {
            setDuration(seconds);
            setIsLoaded(true);
          }}
          onDirty={() => setIsDirty(true)}
          onSelection={setSelection}
          onError={(message) => toast.error(message)}
        />
      </div>
    </div>
  );
}
