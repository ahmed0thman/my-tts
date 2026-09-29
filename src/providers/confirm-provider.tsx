'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * The app's replacement for `window.confirm()`: same call shape (ask, await a
 * yes/no) but rendered as the app's own dialog instead of the browser's.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'تمسح المقطع؟', destructive: true }))) return;
 *
 * One dialog serves the whole app. A second request while one is open
 * resolves the first as "no" — only one question is ever on screen.
 */

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button and a warning icon, for deletes and discarding work. */
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((answer: boolean) => void) | null>(null);

  const settle = useCallback((answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
      setOpen(true);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && settle(false)}>
        {/* Kept mounted with the last options so the close animation has content. */}
        {options && (
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {options.destructive && <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />}
                {options.title}
              </DialogTitle>
              {options.description && (
                <DialogDescription className="whitespace-pre-line leading-relaxed">
                  {options.description}
                </DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => settle(false)}>
                {options.cancelLabel ?? 'إلغاء'}
              </Button>
              <Button
                variant={options.destructive ? 'destructive' : 'default'}
                autoFocus
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? 'تأكيد'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
