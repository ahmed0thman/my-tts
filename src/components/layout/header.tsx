'use client';

import { useEffect, useState } from 'react';
import { Menu, Moon, Sun, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { TOUR_EVENT } from '@/lib/utils';

interface HeaderProps {
  onMenuClick: () => void;
}

const TITLES: Record<string, string> = {
  '/': 'إنشاء صوت جديد',
  '/voices': 'الأصوات',
  '/history': 'السجل',
  '/presets': 'الإعدادات المسبقة',
  '/settings': 'الإعدادات',
};

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  // The server has no idea which theme will resolve on the client, so the
  // toggle can only render its real state after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Gate every theme-derived attribute, not just the icon — a differing
  // aria-label is still a hydration mismatch.
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full shrink-0 items-center border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="page-shell flex w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onMenuClick}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">فتح القائمة</span>
          </Button>
          <h2 className="truncate text-sm font-bold tracking-tight text-muted-foreground">
            {TITLES[pathname] ?? 'NAMAA TTS'}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent(TOUR_EVENT))}
            title="بدء الجولة التعريفية للنظام"
          >
            <Compass className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">جولة تعريفية</span>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={mounted ? (isDark ? 'التبديل للوضع النهاري' : 'التبديل للوضع الليلي') : 'تبديل المظهر'}
          >
            {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
