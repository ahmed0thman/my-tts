"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

/**
 * Radix reads direction from the ambient `dir`, so the fill grows from the
 * correct side in RTL automatically. `min-w-0` keeps the root from forcing
 * its flex parent wider than the card it sits in.
 *
 * `origin` is for a bipolar control (a gain of -20..+20 dB): the fill runs
 * from that value to the thumb, either way, and a tick marks it — filling
 * from the minimum would draw "0 dB" as half full. LTR sliders only.
 */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { origin?: number }
>(({ className, origin, ...props }, ref) => {
  const min = props.min ?? 0
  const max = props.max ?? 100
  const value = (props.value ?? props.defaultValue ?? [min])[0]
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  return (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "group relative flex w-full min-w-0 touch-none select-none items-center py-2 cursor-pointer",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
      {origin === undefined ? (
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
      ) : (
        <span
          className="absolute h-full rounded-full bg-primary"
          style={{ left: `${Math.min(pct(origin), pct(value))}%`, width: `${Math.abs(pct(value) - pct(origin))}%` }}
        />
      )}
    </SliderPrimitive.Track>
    {origin !== undefined && (
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-muted-foreground/60"
        style={{ left: `${pct(origin)}%` }}
      />
    )}

    <SliderPrimitive.Thumb
      className={cn(
        "block h-4 w-4 rounded-full bg-primary shadow-plate",
        "ring-2 ring-background transition-transform duration-150",
        "hover:scale-110 active:scale-95 cursor-grab active:cursor-grabbing",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50"
      )}
    />
  </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
