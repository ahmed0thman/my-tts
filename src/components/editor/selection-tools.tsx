'use client';

import { useState, type ReactNode } from 'react';
import { Gauge, Loader2, MousePointerClick, RotateCcw, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { EditorSelection } from './audio-editor-frame';

/**
 * Volume and speed for the selected part of the clip — or the whole clip
 * when nothing is selected. Select in the waveform (drag), set a value, apply.
 * Each apply is one undo step (⌘Z) and leaves the edited part selected.
 *
 * Speed keeps the voice's pitch (WSOLA in public/audio-editor/sawtak-voice.js):
 * 120% is the same voice talking faster, not a higher one.
 *
 * Layout: three columns — what the edit applies to, volume, speed — each
 * control with its value beside its name and its apply button beside its
 * slider, so nothing has to be matched up across the width of the page.
 */

interface SelectionToolsProps {
  selection: EditorSelection | null;
  disabled?: boolean;
  onApply: (edit: { gainDb: number } | { speed: number }) => Promise<void>;
}

function seconds(value: number) {
  return `${value.toFixed(2)}s`;
}

export function SelectionTools({ selection, disabled, onApply }: SelectionToolsProps) {
  const [gainDb, setGainDb] = useState(0);
  const [speed, setSpeed] = useState(100);
  const [busy, setBusy] = useState<'gain' | 'speed' | null>(null);

  const selected = !!selection && !selection.whole;
  const length = selection ? selection.end - selection.start : 0;
  // Boost past this and the loudest sample goes over full scale; saving then
  // scales the whole file down to fit (normalize_peak in the engine).
  const headroom = selection && Number.isFinite(selection.peakDb) ? Math.max(0, -selection.peakDb - 0.3) : null;
  const overHeadroom = headroom !== null && gainDb > headroom;
  const off = disabled || !selection || busy !== null;

  const run = async (kind: 'gain' | 'speed') => {
    setBusy(kind);
    try {
      if (kind === 'gain') {
        await onApply({ gainDb });
        setGainDb(0);
      } else {
        await onApply({ speed: speed / 100 });
        setSpeed(100);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-[minmax(170px,0.7fr)_1fr_1fr] gap-px">
      <section className="flex flex-col justify-center gap-1 bg-card px-4 py-3">
        <span className="text-[11px] font-semibold text-muted-foreground">بيتطبّق على</span>
        <span className="text-sm font-bold">{selected ? 'الجزء المحدد' : 'الملف كله'}</span>
        {selected ? (
          <span dir="ltr" className="numeric text-end text-[11px] text-muted-foreground">
            {seconds(selection!.start)} → {seconds(selection!.end)} · {seconds(length)}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MousePointerClick className="h-3 w-3 shrink-0" />
            اسحب على الموجة عشان تحدد جزء
          </span>
        )}
      </section>

      <Control
        icon={<Volume2 className="h-4 w-4" />}
        title="الصوت"
        value={`${gainDb > 0 ? '+' : ''}${gainDb} dB`}
        warn={overHeadroom}
        changed={gainDb !== 0}
        onReset={() => setGainDb(0)}
        busy={busy === 'gain'}
        disabled={off}
        onApply={() => void run('gain')}
        slider={
          <Slider
            dir="ltr"
            min={-20}
            max={20}
            step={0.5}
            origin={0}
            value={[gainDb]}
            onValueChange={([value]) => setGainDb(value)}
            disabled={off}
            aria-label="علو الصوت"
          />
        }
        scale={['−20', '0', '+20']}
        note={
          overHeadroom ? (
            <span className="text-destructive" title="عند الحفظ الملف كله هيوطى شوية عشان الجزء ده ميتقصش">
              فوق الحد — الملف هيوطى شوية عند الحفظ
            </span>
          ) : headroom !== null ? (
            <>
              أقصى رفع من غير تشويه:{' '}
              <span dir="ltr" className="numeric">
                +{headroom.toFixed(1)} dB
              </span>
            </>
          ) : null
        }
      />

      <Control
        icon={<Gauge className="h-4 w-4" />}
        title="السرعة"
        value={`${speed}%`}
        changed={speed !== 100}
        onReset={() => setSpeed(100)}
        busy={busy === 'speed'}
        disabled={off}
        onApply={() => void run('speed')}
        slider={
          <Slider
            dir="ltr"
            min={50}
            max={200}
            step={5}
            origin={100}
            value={[speed]}
            onValueChange={([value]) => setSpeed(value)}
            disabled={off}
            aria-label="سرعة الكلام"
          />
        }
        scale={['50%', '100%', '200%']}
        scaleOrigin={100 / 3}
        note={
          selection && speed !== 100 ? (
            <>
              المدة{' '}
              <span dir="ltr" className="numeric">
                {seconds(length)} → {seconds(length / (speed / 100))}
              </span>{' '}
              · نفس طبقة الصوت
            </>
          ) : (
            'أسرع أو أبطأ من غير ما الصوت يتغيّر'
          )
        }
      />
    </div>
  );
}

interface ControlProps {
  icon: ReactNode;
  title: string;
  value: string;
  warn?: boolean;
  changed: boolean;
  onReset: () => void;
  busy: boolean;
  disabled: boolean;
  onApply: () => void;
  slider: ReactNode;
  /** Labels under the slider: min, origin, max. */
  scale: [string, string, string];
  /** Where the middle label sits, % from the left, when the origin is not centred. */
  scaleOrigin?: number;
  note: ReactNode;
}

function Control({
  icon,
  title,
  value,
  warn,
  changed,
  onReset,
  busy,
  disabled,
  onApply,
  slider,
  scale,
  scaleOrigin = 50,
  note,
}: ControlProps) {
  return (
    <section className="flex flex-col gap-2 bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </span>
        <span className="flex items-center gap-1">
          {changed && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6"
              onClick={onReset}
              disabled={disabled}
              title="رجّعه"
              aria-label={`رجّع ${title}`}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
          <span
            dir="ltr"
            className={cn(
              'numeric min-w-[4.25rem] rounded-md border px-2 py-0.5 text-center text-xs font-semibold',
              warn ? 'border-destructive/50 text-destructive' : changed ? 'border-primary/40 text-primary' : 'border-border',
            )}
          >
            {value}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {slider}
          <div dir="ltr" className="numeric relative h-3 text-[10px] leading-3 text-muted-foreground">
            <span className="absolute left-0">{scale[0]}</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${scaleOrigin}%` }}>
              {scale[1]}
            </span>
            <span className="absolute right-0">{scale[2]}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant={changed ? 'default' : 'outline'}
          className="w-20 shrink-0"
          disabled={disabled || !changed}
          onClick={onApply}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'طبّق'}
        </Button>
      </div>

      <p className="min-h-4 text-[11px] leading-4 text-muted-foreground">{note}</p>
    </section>
  );
}
