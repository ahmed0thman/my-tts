'use client';

import { useState } from 'react';
import {
  useDeleteVoiceProfile,
  useSetDefaultVoiceProfile,
  useUpdateVoiceProfile,
} from '@/hooks/use-voice-profiles';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AudioPlayer } from '@/components/generation/audio-player';
import { useModels } from '@/hooks/use-models';
import { formatDuration, formatDate } from '@/lib/utils';
import { Trash2, Star, CheckCircle, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export function VoiceCard({ profile }: { profile: any }) {
  const { mutate: deleteProfile, isPending: isDeletePending } = useDeleteVoiceProfile();
  const { mutate: setDefault, isPending: isDefaultPending } = useSetDefaultVoiceProfile();
  const { mutate: updateProfile, isPending: isUpdatePending } = useUpdateVoiceProfile();

  const [isTextOpen, setIsTextOpen] = useState(false);
  const [draftText, setDraftText] = useState<string>(profile.referenceText || '');

  // SILMA needs the transcription to clone; a profile without one cannot generate.
  const needsReferenceText = !profile.referenceText?.trim();

  // A clip longer than the model's reference window makes it recite the
  // reference instead of the requested text, so an over-long profile is
  // broken rather than merely suboptimal — say so on the card, because the
  // failure is otherwise only visible in the generated audio. The cap comes
  // from the engine's own `describe()`, so it follows whichever model is
  // registered.
  const { data: modelData } = useModels();
  const referenceCap = modelData?.models.reduce<number | null>(
    (shortest, model) =>
      model.maxReferenceSeconds !== null &&
      (shortest === null || model.maxReferenceSeconds < shortest)
        ? model.maxReferenceSeconds
        : shortest,
    null,
  );
  const isTooLong =
    referenceCap != null && profile.duration != null && profile.duration > referenceCap;

  const handleSaveText = () => {
    const formData = new FormData();
    formData.append('referenceText', draftText);
    updateProfile(
      { id: profile.id, formData },
      {
        onSuccess: () => {
          setIsTextOpen(false);
          toast.success('تم حفظ نص العينة');
        },
      },
    );
  };

  const handleDelete = () => {
    if (confirm('هل أنت متأكد من حذف هذا الصوت؟')) {
      deleteProfile(profile.id, {
        onSuccess: () => toast.success('تم حذف الصوت بنجاح'),
        onError: () => toast.error('حدث خطأ أثناء الحذف'),
      });
    }
  };

  const handleSetDefault = () => {
    setDefault(profile.id, {
      onSuccess: () => toast.success('تم تعيين الصوت كافتراضي'),
      onError: () => toast.error('حدث خطأ'),
    });
  };

  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-plate transition-colors duration-200 hover:border-border-strong">
      <header className="flex items-start justify-between gap-3 p-5 pb-4">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-base font-bold tracking-tight" title={profile.name}>
            {profile.name}
          </h3>
          {profile.description ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {profile.description}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/60">بدون وصف</p>
          )}
          {needsReferenceText && (
            <Badge
              variant="outline"
              className="gap-1 border-amber-300 bg-amber-500/10 text-[10px] text-amber-600 dark:border-amber-900 dark:text-amber-400"
            >
              <AlertTriangle className="h-3 w-3" />
              ناقص نص العينة
            </Badge>
          )}
          {isTooLong && (
            <Badge
              variant="outline"
              className="gap-1 border-destructive/40 bg-destructive/10 text-[10px] text-destructive"
            >
              <AlertTriangle className="h-3 w-3" />
              أطول من {referenceCap} ثواني — سجّل واحدة أقصر
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Shipped with the model rather than recorded here — these sort below
              the user's own voices, so the badge explains the grouping. */}
          {profile.isBuiltin && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              جاهز
            </Badge>
          )}
          {profile.isDefault && (
            <Badge variant="accent" className="shrink-0">
              <Star className="fill-current" />
              افتراضي
            </Badge>
          )}
        </div>
      </header>

      {/* Metadata is LTR-isolated: durations and dates otherwise reorder
          against the surrounding Arabic run. */}
      <div className="flex items-center justify-between gap-2 border-y border-border bg-muted/40 px-5 py-2.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="font-semibold">المدة</span>
          <span className="numeric">{formatDuration(profile.duration || 0)}</span>
        </span>
        <span className="bidi-isolate truncate">{formatDate(profile.createdAt)}</span>
      </div>

      <div className="flex-1 p-5 pt-4">
        {profile.referenceAudioPath && (
          <AudioPlayer src={`/api/audio/${profile.referenceAudioPath}`} compact />
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-border p-4">
        <Button
          variant={needsReferenceText ? 'default' : 'outline'}
          size="sm"
          className="flex-1"
          onClick={() => {
            setDraftText(profile.referenceText || '');
            setIsTextOpen(true);
          }}
          title="النص المنطوق في العينة — النموذج محتاجه عشان يستنسخ الصوت"
        >
          <FileText className="h-3.5 w-3.5" />
          نص العينة
        </Button>
        {!profile.isDefault && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleSetDefault}
            disabled={isDefaultPending}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            تعيين كافتراضي
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={handleDelete}
          disabled={isDeletePending || profile.isDefault}
          title={profile.isDefault ? 'لا يمكن حذف الصوت الافتراضي' : 'حذف الصوت'}
        >
          <Trash2 className="h-3.5 w-3.5" />
          حذف
        </Button>
      </footer>

      <Dialog open={isTextOpen} onOpenChange={setIsTextOpen}>
        <DialogContent dir="rtl" className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>نص العينة — {profile.name}</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              اكتب بالظبط اللي اتقال في التسجيل المرجعي. النموذج بيستنسخ الصوت من
              العينة + نصها، ولو النص مش مطابق النطق هيطلع متعثر.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            rows={5}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="النص المنطوق في العينة الصوتية..."
          />

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsTextOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveText} disabled={!draftText.trim() || isUpdatePending}>
              {isUpdatePending ? 'جاري الحفظ...' : 'حفظ النص'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
