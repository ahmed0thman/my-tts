'use client';

import { useState, type ReactNode } from 'react';
import { FileAudio, Loader2, Mic } from 'lucide-react';
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
import { useCreateClip } from '@/hooks/use-clips';
import type { ProcessedRecording } from '@/lib/audio-encode';
import { AudioFilePicker } from './audio-file-picker';
import { ClipRecorder } from './clip-recorder';

/** Add a clip to the library by uploading a file or recording one. */
export function NewClipDialog({ children, initialTab = 'upload' }: { children: ReactNode; initialTab?: 'upload' | 'recording' }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'upload' | 'recording'>(initialTab);
  const [audio, setAudio] = useState<ProcessedRecording | null>(null);
  const [name, setName] = useState('');
  const create = useCreateClip();

  const reset = (next: 'upload' | 'recording' = initialTab) => {
    setTab(next);
    setAudio(null);
    setName('');
  };

  const save = () => {
    if (!audio || !name.trim()) return;
    create.mutate(
      { file: audio.file, name: name.trim(), source: tab },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>مقطع جديد في المكتبة</DialogTitle>
          <DialogDescription>
            مقدمة، ختام، أو تسجيل بصوتك — تحطّه في أي حلقة بعد كده من «إضافة صوت».
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as 'upload' | 'recording');
            setAudio(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">
              <FileAudio className="h-3.5 w-3.5" />
              ارفع ملف
            </TabsTrigger>
            <TabsTrigger value="recording">
              <Mic className="h-3.5 w-3.5" />
              سجّل بصوتك
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <AudioFilePicker
              onReady={(next, fileName) => {
                setAudio(next);
                if (next && fileName && !name.trim()) setName(fileName);
              }}
            />
          </TabsContent>
          <TabsContent value="recording">
            <ClipRecorder onReady={setAudio} />
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5">
          <Label htmlFor="clip-name">الاسم</Label>
          <Input
            id="clip-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً: ختام الحلقات"
            maxLength={120}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={save} disabled={!audio || !name.trim() || create.isPending}>
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            احفظ في المكتبة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
