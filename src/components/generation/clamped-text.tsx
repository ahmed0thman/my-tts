'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Text cut to a few lines in a card, with «اقرأ الكل» only when it is
 * actually cut — measured, since how many characters fit depends on the
 * card's width.
 */
export function ClampedText({ text, lines = 4, className }: { text: string; lines?: 3 | 4 | 5 | 6; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="space-y-1">
      <p
        ref={ref}
        // auto: an English take reads left to right in its card.
        dir="auto"
        className={cn(
          'whitespace-pre-wrap text-sm leading-relaxed',
          !expanded &&
            { 3: 'line-clamp-3', 4: 'line-clamp-4', 5: 'line-clamp-5', 6: 'line-clamp-6' }[lines],
          className,
        )}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="cursor-pointer text-[11px] font-semibold text-primary hover:underline"
        >
          {expanded ? 'أقل' : 'اقرأ الكل'}
        </button>
      )}
    </div>
  );
}
