'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Film, FolderOpen, Loader2, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCreateDubFromExisting, useDubs, useUploadDub } from '@/hooks/use-dubs';
import { cn, formatDuration } from '@/lib/utils';

type Tab = 'upload' | 'existing';

function formatSize(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/**
 * Start a dub: upload a video, or reuse one already here (the same video in
 * another voice or language).
 */
export function NewDubDialog({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDub();
  const fromExisting = useCreateDubFromExisting();
  const { data: dubs } = useDubs();
  const isPending = upload.isPending || fromExisting.isPending;

  const pick = (next: File | undefined) => {
    if (!next) return;
    setFile(next);
    if (!title.trim()) setTitle(next.name.replace(/\.[^.]+$/, ''));
  };

  const done = (id: string) => {
    setOpen(false);
    router.push(`/dubbing/${id}`);
  };

  const start = () => {
    const name = title.trim();
    if (!name) return;
    if (tab === 'upload' && file) upload.mutate({ file, title: name }, { onSuccess: ({ id }) => done(id) });
    if (tab === 'existing' && sourceId) {
      fromExisting.mutate({ sourceId, title: name }, { onSuccess: (dub) => done(dub.id) });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        setOpen(next);
        if (next) {
          setTab('upload');
          setFile(null);
          setSourceId(null);
          setTitle('');
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>دبلجة جديدة</DialogTitle>
          <DialogDescription>
            اختار فيديو بصوته. هنفرّغ الكلام اللي فيه سطر سطر بتوقيته، وبعدين نولّده بصوت من أصواتك ونركّبه مكان الصوت
            الأصلي.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" disabled={isPending}>
              <UploadCloud className="h-3.5 w-3.5" />
              ارفع فيديو
            </TabsTrigger>
            <TabsTrigger value="existing" disabled={isPending || !dubs?.length}>
              <FolderOpen className="h-3.5 w-3.5" />
              فيديو عندك
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <input
              ref={inputRef}
              type="file"
              accept="video/*,.mkv"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            {file ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3">
                  <Film className="h-4 w-4 shrink-0 text-primary" />
                  <div className="flex min-w-0 flex-1 flex-col text-sm">
                    <span className="truncate font-semibold" dir="auto" title={file.name}>
                      {file.name}
                    </span>
                    <span className="numeric text-xs text-muted-foreground">{formatSize(file.size)}</span>
                  </div>
                  {!isPending && (
                    <Button variant="ghost" size="icon-sm" aria-label="شيل الملف" onClick={() => setFile(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {upload.progress !== null && (
                  <div className="space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {upload.progress < 100 ? (
                        <>
                          بيترفع — <span className="numeric">{upload.progress}%</span>
                        </>
                      ) : (
                        'بنقرا الفيديو...'
                      )}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
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
                  pick(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors duration-150',
                  isDragging ? 'border-primary bg-primary/10' : 'border-border-strong hover:border-primary/50 hover:bg-muted/50',
                )}
              >
                <UploadCloud className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-semibold">اسحب الفيديو هنا أو دوس تختاره</p>
                <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                  MP4 · MOV · MKV · WEBM
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="existing">
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {dubs?.map((dub) => (
                <button
                  key={dub.id}
                  type="button"
                  onClick={() => {
                    setSourceId(dub.id);
                    if (!title.trim()) setTitle(dub.title);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-2 text-start transition-colors',
                    sourceId === dub.id ? 'border-primary bg-primary/5' : 'border-border hover:border-border-strong',
                  )}
                >
                  {dub.posterPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/audio/${dub.posterPath}`} alt="" className="h-10 w-16 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="grid h-10 w-16 shrink-0 place-items-center rounded-md bg-muted">
                      <Film className="h-4 w-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold" dir="auto">
                      {dub.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground" dir="auto">
                      <span className="numeric">{formatDuration(dub.duration)}</span> · {dub.videoName}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5">
          <Label htmlFor="dub-title">الاسم</Label>
          <Input
            id="dub-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: إعلان المنتج — إنجليزي"
            maxLength={120}
            dir="auto"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={isPending} onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button
            onClick={start}
            disabled={!title.trim() || isPending || (tab === 'upload' ? !file : !sourceId)}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            ابدأ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
