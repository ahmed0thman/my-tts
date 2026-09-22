'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateVoiceProfile } from '@/hooks/use-voice-profiles';
import { voiceProfileSchema } from '@/lib/validations';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UploadCloud, X, Loader2, Mic, FileAudio } from 'lucide-react';
import { AudioPlayer } from '@/components/generation/audio-player';
import { VoiceRecorder } from './voice-recorder';
import { REFERENCE_SCRIPT } from '@/lib/reference-script';
import type { ProcessedRecording } from '@/lib/audio-encode';
import { formatFileSize } from '@/lib/utils';
import { toast } from 'sonner';
import { z } from 'zod';

export function UploadDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tab, setTab] = useState<'record' | 'upload'>('record');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: createProfile, isPending } = useCreateVoiceProfile();

  const form = useForm<z.infer<typeof voiceProfileSchema>>({
    resolver: zodResolver(voiceProfileSchema),
    defaultValues: {
      name: '',
      description: '',
      referenceText: '',
    },
  });

  const handleFile = (selectedFile: File) => {
    if (selectedFile.type !== 'audio/wav') {
      toast.error('يرجى اختيار ملف WAV فقط');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('حجم الملف يجب ألا يتجاوز 10 ميجابايت');
      return;
    }

    setFile(selectedFile);
    const url = URL.createObjectURL(selectedFile);
    setAudioUrl(url);
    
    // Auto-fill name if empty
    if (!form.getValues('name')) {
      form.setValue('name', selectedFile.name.replace('.wav', ''));
    }
  };

  const handleRecordingReady = (recording: ProcessedRecording | null) => {
    if (!recording) {
      setFile(null);
      setAudioUrl(null);
      return;
    }

    setFile(recording.file);
    // The recorder owns this object URL and revokes it on reset
    setAudioUrl(recording.url);

    // The user read our script verbatim, so we can hand the engine an exact
    // transcription instead of asking them to type one.
    form.setValue('referenceText', REFERENCE_SCRIPT, { shouldValidate: true });

    if (!form.getValues('name')) {
      form.setValue('name', 'صوتي');
    }
  };

  const onSubmit = async (values: z.infer<typeof voiceProfileSchema>) => {
    if (!file) {
      toast.error('يرجى اختيار ملف صوتي');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('name', values.name);
      if (values.description) formData.append('description', values.description);
      formData.append('referenceText', values.referenceText ?? '');
      formData.append('file', file);

      await createProfile(formData);
      toast.success('تم إضافة الصوت بنجاح');
      
      // Reset
      setOpen(false);
      setFile(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      form.reset();
    } catch (error) {
      toast.error('حدث خطأ أثناء إضافة الصوت');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val && audioUrl) {
        // Cleanup on close
        setTimeout(() => {
          setFile(null);
          setAudioUrl(null);
          setTab('record');
          form.reset();
        }, 200);
      }
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة صوت جديد</DialogTitle>
          <DialogDescription>
            سجّل مباشرة أو ارفع ملف WAV نظيف من ٣ لـ ١٠ ثواني عشان الاستنساخ يطلع دقيق.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs
              value={tab}
              onValueChange={(value) => {
                setTab(value as 'record' | 'upload');
                // Switching source discards the pending take so the two tabs never disagree
                setFile(null);
                setAudioUrl(null);
                form.setValue('referenceText', '');
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="record">
                  <Mic className="h-3.5 w-3.5" />
                  سجّل صوتك
                </TabsTrigger>
                <TabsTrigger value="upload">
                  <FileAudio className="h-3.5 w-3.5" />
                  ارفع ملف
                </TabsTrigger>
              </TabsList>

              <TabsContent value="record">
                <VoiceRecorder onRecordingReady={handleRecordingReady} />
              </TabsContent>

              <TabsContent value="upload">
                {!file ? (
                  <div 
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors duration-150 ${
                      isDragging
                        ? 'border-primary bg-primary/10'
                        : 'border-border-strong hover:border-primary/50 hover:bg-muted/50'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      accept=".wav" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    />
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
                        <UploadCloud className="h-5 w-5" />
                      </span>
                      <p className="text-sm font-bold text-foreground">اسحب وأفلت ملف WAV هنا</p>
                      {/* The size limit is its own LTR run — inline it in the
                          Arabic sentence and the bracket lands on the wrong
                          side, rendering as "MB(الحد الأقصى 10". */}
                      <p className="text-xs">
                        أو انقر لاختيار ملف · الحد الأقصى <span className="numeric">10MB</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 p-3">
                      <div className="flex min-w-0 flex-col text-sm">
                        <span className="truncate font-semibold" title={file.name}>
                          {file.name}
                        </span>
                        <span className="numeric text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="إزالة الملف"
                        onClick={() => {
                          setFile(null);
                          setAudioUrl(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {audioUrl && <AudioPlayer src={audioUrl} compact />}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم الصوت</FormLabel>
                  <FormControl>
                    <Input placeholder="مثال: صوت أحمد" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="referenceText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    نص العينة
                    <span className="mr-1 text-xs font-normal text-muted-foreground">
                      (اللي اتقال بالظبط في التسجيل)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="اكتب هنا النص المنطوق في الملف الصوتي..."
                      {...field}
                    />
                  </FormControl>
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    النموذج بيستنسخ الصوت من العينة + نصها. لو النص مش مطابق، النطق هيطلع
                    متعثر. لو سجّلت من التبويب التاني، النص بيتملي تلقائياً.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الوصف (اختياري)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="وصف قصير للصوت..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={isPending || !file}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isPending ? 'جاري الحفظ...' : 'حفظ الصوت'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
