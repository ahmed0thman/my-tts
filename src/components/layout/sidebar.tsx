'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Music, Mic, History, Settings2, Settings, X } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { AiVoice01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { EngineStatus } from './engine-status';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  onClose?: () => void;
}

const LINKS = [
  { href: '/', label: 'إنشاء صوت', icon: Music },
  { href: '/voices', label: 'الأصوات', icon: Mic },
  { href: '/history', label: 'السجل', icon: History },
  { href: '/presets', label: 'الإعدادات المسبقة', icon: Settings2 },
  { href: '/settings', label: 'الإعدادات', icon: Settings },
];

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-full flex-col border-s border-border bg-card text-card-foreground">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-5">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" onClick={onClose}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <HugeiconsIcon icon={AiVoice01Icon} size={18} />
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="truncate text-sm font-extrabold tracking-tight">Ahmed TTS</span>
            <span className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">
              استوديو الصوت المصري
            </span>
          </span>
        </Link>

        {onClose && (
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">إغلاق القائمة</span>
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {LINKS.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold',
                'transition-colors duration-150',
                isActive
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {/* A rail marker reads as "you are here" without repainting the
                  whole row in the accent colour. */}
              <span
                className={cn(
                  'absolute inset-y-2 start-0 w-0.5 rounded-full transition-colors',
                  isActive ? 'bg-primary' : 'bg-transparent',
                )}
                aria-hidden
              />
              <Icon
                className={cn(
                  'h-[18px] w-[18px] shrink-0 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <EngineStatus />
      </div>
    </div>
  );
}
