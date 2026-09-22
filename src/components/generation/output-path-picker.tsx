'use client';

import React, { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useDirectoryListing } from '@/hooks/use-directory-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Folder,
  FolderOpen,
  ChevronLeft,
  Loader2,
  RotateCcw,
  HelpCircle,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY = 'namaa:output-dir';

export function OutputPathPicker() {
  const { setValue, watch } = useFormContext();
  const outputDir: string = watch('outputDir') || '';

  const [isOpen, setIsOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);
  const [manualPath, setManualPath] = useState('');

  const { data: listing, isLoading, error } = useDirectoryListing(browsePath, isOpen);

  // Restore the last chosen folder across sessions
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setValue('outputDir', saved, { shouldDirty: false });
    } catch {
      // localStorage can be unavailable (private mode); the default folder still works
    }
  }, [setValue]);

  // Keep the manual field in step with wherever the user has browsed to,
  // so the confirm button always commits the folder they are looking at.
  useEffect(() => {
    if (listing?.path) setManualPath(listing.path);
  }, [listing?.path]);

  const persist = (path: string) => {
    setValue('outputDir', path, { shouldDirty: true });
    try {
      if (path) {
        window.localStorage.setItem(STORAGE_KEY, path);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // non-fatal
    }
  };

  const handleOpen = () => {
    setBrowsePath(outputDir || undefined);
    setManualPath(outputDir);
    setIsOpen(true);
  };

  const handleConfirm = (path: string) => {
    persist(path);
    setIsOpen(false);
    toast.success('تم ضبط مجلد الحفظ', { description: path });
  };

  const handleResetToDefault = () => {
    persist('');
    toast.info('رجعنا لمجلد التطبيق الافتراضي');
  };

  const currentPath = listing?.path ?? browsePath ?? '';
  const isDefault = !outputDir;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold">مجلد حفظ الملفات</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent dir="rtl" className="max-w-xs text-xs">
              المكان اللي هيتحفظ فيه ملف الـ WAV على جهازك. نسخة أصلية بتفضل دايماً
              في مكتبة التطبيق عشان التشغيل والسجل يشتغلوا عادي.
            </TooltipContent>
          </Tooltip>
        </div>
        {isDefault ? (
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground">
            افتراضي
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0.5 border-success/30 bg-success/10 text-success dark:border-success/30 dark:text-success"
          >
            مجلد مخصص
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpen}
          className="flex-1 flex items-center gap-2 min-w-0 rounded-xl border bg-background/80 px-3 py-2.5 text-right shadow-2xs transition-all hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
        >
          <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          <span
            dir="ltr"
            className="flex-1 truncate font-mono text-[11px] text-muted-foreground text-left"
            title={outputDir || 'storage/audio'}
          >
            {outputDir || 'storage/audio (default)'}
          </span>
        </button>

        {!isDefault && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 cursor-pointer"
                onClick={handleResetToDefault}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent dir="rtl" className="text-xs">
              رجوع للمجلد الافتراضي
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>اختيار مجلد الحفظ</DialogTitle>
            <DialogDescription className="text-xs">
              تصفح مجلدات جهازك أو اكتب المسار مباشرةً. المجلد هيتعمل تلقائياً لو مش موجود.
            </DialogDescription>
          </DialogHeader>

          {/* Quick locations */}
          {listing?.shortcuts && listing.shortcuts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {listing.shortcuts.map((shortcut) => (
                <button
                  key={shortcut.path}
                  type="button"
                  onClick={() => setBrowsePath(shortcut.path)}
                  className="rounded-lg border bg-muted/40 px-2.5 py-1 text-[11px] font-semibold transition-colors hover:border-primary/40 hover:bg-primary/10 cursor-pointer"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          )}

          {/* Breadcrumb bar */}
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 cursor-pointer"
              disabled={!listing?.parent}
              onClick={() => listing?.parent && setBrowsePath(listing.parent)}
            >
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </Button>
            <span dir="ltr" className="flex-1 truncate font-mono text-[11px] text-left" title={currentPath}>
              {currentPath || '…'}
            </span>
            {isLoading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
          </div>

          {/* Directory list */}
          <div className="h-48 overflow-y-auto rounded-lg border bg-background/60 p-1">
            {error && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <AlertTriangle className="h-5 w-5 text-primary" />
                <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
              </div>
            )}

            {!error && listing?.entries.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-xs text-muted-foreground">مفيش مجلدات فرعية هنا</p>
              </div>
            )}

            {!error &&
              listing?.entries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onDoubleClick={() => setBrowsePath(entry.path)}
                  onClick={() => setBrowsePath(entry.path)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-right transition-colors hover:bg-primary/10 cursor-pointer disabled:opacity-40"
                  disabled={!entry.writable}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="flex-1 truncate text-xs font-medium">{entry.name}</span>
                  {!entry.writable && (
                    <span className="text-[10px] text-muted-foreground">للقراءة فقط</span>
                  )}
                </button>
              ))}
          </div>

          {/* Manual path entry */}
          <div className="space-y-1.5">
            <label htmlFor="manual-output-path" className="text-[11px] font-semibold text-muted-foreground">
              أو اكتب المسار يدوياً
            </label>
            <Input
              id="manual-output-path"
              dir="ltr"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder="~/Desktop/ahmed-tts-audio"
              className="font-mono text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => handleConfirm('')} className="cursor-pointer">
              استخدام المجلد الافتراضي
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="cursor-pointer">
                إلغاء
              </Button>
              <Button
                type="button"
                className="gap-1.5 cursor-pointer"
                disabled={!manualPath.trim()}
                onClick={() => handleConfirm(manualPath.trim())}
              >
                <Check className="h-3.5 w-3.5" />
                اختيار المجلد
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
