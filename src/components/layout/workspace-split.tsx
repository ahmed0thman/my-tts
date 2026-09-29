'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The studio and episode layout: what you type and the voice settings on the
 * right, the generated clips as a grid on the left.
 *
 * On large screens the page fills the window (AppShell stops scrolling it —
 * src/lib/layout.ts) and each side scrolls on its own, so the settings stay
 * put while you go through the clips. Below `lg` the two stack and the page
 * scrolls as usual.
 *
 * The grid's column count follows the width of its own pane (a container
 * query), not the window's: one column next to the settings on a laptop,
 * up to three on a wide monitor.
 */

interface WorkspaceSplitProps {
  header?: ReactNode;
  /** Right side: input and settings. Stays in place; scrolls only when taller than the window. */
  controls: ReactNode;
  /** Above the grid, outside its scroll: title, status, bulk actions. */
  toolbar?: ReactNode;
  /** The grid (use ClipGrid) or an empty state. */
  children: ReactNode;
}

export function WorkspaceSplit({ header, controls, toolbar, children }: WorkspaceSplitProps) {
  return (
    <div className="flex flex-col gap-5 lg:h-full lg:min-h-0">
      {header && <div className="shrink-0">{header}</div>}
      <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-0">
        {/* p-1 / -m-1 keep focus rings and shadows from being clipped by the scroll box. */}
        <aside className="space-y-5 lg:-m-1 lg:w-[430px] lg:shrink-0 lg:overflow-y-auto lg:overscroll-contain lg:p-1 lg:pe-4">
          {controls}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col gap-3 lg:min-h-0 lg:border-s lg:border-border lg:ps-5">
          {toolbar && <div className="shrink-0 space-y-3">{toolbar}</div>}
          <div className="@container lg:-m-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:p-1">
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Cards at ≥ ~16.5rem each: 1 → 2 → 3 columns as the pane widens. Three at most, so a card stays wide enough to read. */
export function ClipGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 @min-[34rem]:grid-cols-2 @min-[52rem]:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The grid pane's heading row. */
export function PaneHeading({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
