'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useSaveToLibrary } from '@/hooks/use-clips';

/**
 * Save a copy of a take to the clip library, under a name. Opened by its
 * trigger (`children`), or controlled (`open`) when opened from a menu.
 */
export function SaveClipDialog({
  generationId,
  defaultName,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  generationId: string;
  defaultName: string;
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [name, setName] = useState(defaultName);
  const save = useSaveToLibrary();

  useEffect(() => {
    if (open) setName(defaultName.slice(0, 60));
  }, [open, defaultName]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>احفظ في المكتبة</DialogTitle>
          <DialogDescription>
            نسخة من الصوت ده هتتحفظ في «مكتبة المقاطع»، وتقدر تحطها في أي حلقة. تعديل المقطع أو مسحه بعد كده مش هيأثر
            على النسخة دي.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="save-clip-name">الاسم</Label>
          <Input id="save-clip-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate({ generationId, name: name.trim() }, { onSuccess: () => setOpen(false) })}
          >
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            احفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
