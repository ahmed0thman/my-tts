'use client';

import React, { useState, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { useVoiceProfiles } from '@/hooks/use-voice-profiles';
import { usePresets, useCreatePreset } from '@/hooks/use-presets';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, HelpCircle, Sparkles, Mic, Play, Pause, Volume2, Sliders } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Yoga01Icon,
  Chatting01Icon,
  SparklesIcon,
  FlashIcon,
  FireIcon,
  Clock01Icon,
  HourglassIcon,
  AiVoice01Icon,
  StarIcon,
  Mic01Icon
} from '@hugeicons/core-free-icons';
import { ModelSelector } from './model-selector';
import { ModelParams } from './model-params';
import { OutputPathPicker } from './output-path-picker';
import { formatDuration } from '@/lib/utils';
import type { TtsModel } from '@/lib/tts-client';
import { toast } from 'sonner';
import { DEFAULT_MODEL_ID, LEGACY_MODEL_ID } from '@/lib/models';

interface VoiceControlsProps {
  /** Restore/remember the model and folder in localStorage — see ModelSelector. */
  restoreSaved?: boolean;
  /**
   * Render the save-folder picker. A project hides it here and shows it next
   * to the merge instead, since there the folder receives the episode rather
   * than each clip.
   */
  showOutputPath?: boolean;
}

export function VoiceControls({ restoreSaved = true, showOutputPath = true }: VoiceControlsProps = {}) {
  const { control, setValue, watch } = useFormContext();
  const [activeModel, setActiveModel] = useState<TtsModel | undefined>(undefined);
  const { data: profiles } = useVoiceProfiles();
  const { data: presets } = usePresets();
  const { mutate: createPreset, isPending: isSavingPreset } = useCreatePreset();

  const [presetName, setPresetName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [auditioningProfileId, setAuditioningProfileId] = useState<string | null>(null);
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null);

  const modelId: string = watch('modelId') || DEFAULT_MODEL_ID;
  const params: Record<string, number> = watch('params') || {};
  const currentVoiceId = watch('voiceProfileId') || 'default';

  // Drives the decorative EQ bars; any model's first knob works.
  const firstParam = activeModel?.params?.[0];
  const eqIntensity = firstParam ? (params[firstParam.key] ?? firstParam.default) / firstParam.max : 0.5;

  // Presets are model-scoped: the parameter names do not transfer between
  // engines, so only show the ones saved for the active model.
  const applicablePresets = (presets ?? []).filter(
    (p: any) => (p.modelId ?? LEGACY_MODEL_ID) === modelId,
  );

  const handleApplyPreset = (presetId: string) => {
    const preset = applicablePresets.find((p: any) => p.id === presetId);
    if (preset) {
      setValue('params', (preset.params as Record<string, number>) ?? {}, { shouldValidate: true });
      if (preset.voiceProfileId) {
        setValue('voiceProfileId', preset.voiceProfileId, { shouldValidate: true });
      }
      toast.success(`تم تطبيق إعداد "${preset.name}"`);
    }
  };


  const handleAuditionVoice = (e: React.MouseEvent, profile: any) => {
    e.stopPropagation();
    if (!profile.referenceAudioPath) return;

    if (auditioningProfileId === profile.id) {
      auditionAudioRef.current?.pause();
      setAuditioningProfileId(null);
    } else {
      if (auditionAudioRef.current) {
        auditionAudioRef.current.pause();
      }
      const audio = new Audio(`/api/audio/${profile.referenceAudioPath}`);
      auditionAudioRef.current = audio;
      audio.play();
      setAuditioningProfileId(profile.id);
      audio.onended = () => setAuditioningProfileId(null);
    }
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    createPreset({
      name: presetName.trim(),
      modelId,
      params,
      voiceProfileId: currentVoiceId === 'default' ? undefined : currentVoiceId,
    }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setPresetName('');
        toast.success('تم حفظ الإعداد المسبق بنجاح');
      }
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-plate md:p-5">
        {/* Model Selector */}
        <div id="tour-model-select">
          <ModelSelector onModelChange={setActiveModel} restoreSaved={restoreSaved} />
        </div>

        {/* Header & Voice Profile Selector */}
        <div id="tour-voice-select" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-primary/10 text-primary">
                <HugeiconsIcon icon={AiVoice01Icon} size={16} />
              </span>
              <h3 className="text-sm font-bold tracking-tight">اختيار واستنساخ الصوت</h3>
            </div>
            {applicablePresets.length > 0 && (
              <Select onValueChange={handleApplyPreset}>
                <SelectTrigger dir="rtl" className="h-8 w-36 text-xs">
                  <SelectValue placeholder="قوالبك المحفوظة" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {applicablePresets.map((preset: any) => (
                    <SelectItem key={preset.id} value={preset.id} className="text-xs">
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <FormField
            control={control}
            name="voiceProfileId"
            render={({ field }) => (
              <FormItem>
                <Select onValueChange={field.onChange} value={field.value || 'default'}>
                  <FormControl>
                    <SelectTrigger dir="rtl" className="h-14 w-full">
                      <SelectValue placeholder="اختر الصوت" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent dir="rtl">
                    <SelectItem value="default" className="cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <span className="p-1.5 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <HugeiconsIcon icon={AiVoice01Icon} size={18} />
                        </span>
                        <div className="text-right">
                          <p className="font-bold text-sm">الصوت الافتراضي</p>
                          <p className="text-[11px] text-muted-foreground">صوت مصري استوديو متوازن</p>
                        </div>
                      </div>
                    </SelectItem>
                    {profiles?.map((profile: any) => (
                      <SelectItem key={profile.id} value={profile.id} className="cursor-pointer">
                        <div className="flex items-center justify-between w-full gap-4">
                          <div className="flex items-center gap-2.5">
                            <span className="p-1.5 rounded-lg bg-muted flex items-center justify-center text-foreground">
                              {profile.isDefault ? (
                                <HugeiconsIcon icon={StarIcon} size={16} className="fill-primary text-primary" />
                              ) : (
                                <HugeiconsIcon icon={Mic01Icon} size={16} className="text-primary" />
                              )}
                            </span>
                            <div className="text-right">
                              <p className="font-bold text-sm">{profile.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                عينة مستنسخة {profile.duration ? `(${formatDuration(profile.duration)})` : ''}
                              </p>
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        </div>

        {/* Dynamic Acoustic Visualizer Bars */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold">المؤثرات الصوتية العصبية</span>
          </div>
          {/* Animated EQ Bars */}
          <div className="flex items-end gap-1 h-5">
            {[0.4, 0.8, 0.6, 0.9, 0.5, 0.7, 1.0, 0.6, 0.8, 0.4].map((ratio, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-primary/70 transition-[height] duration-300"
                style={{
                  height: `${Math.max(4, Math.min(20, ratio * 20 * (eqIntensity * 0.6 + 0.4)))}px`,
                }}
              />
            ))}
          </div>
        </div>

        <div id="tour-tone-controls">
          <ModelParams model={activeModel} />
        </div>

        {/* Save Location */}
        {showOutputPath && (
          <div id="tour-output-path" className="border-t border-border pt-4">
            <OutputPathPicker restoreSaved={restoreSaved} />
          </div>
        )}

        {/* Preset Save Button */}
        <div className="flex justify-end border-t border-border pt-4">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Save className="h-3.5 w-3.5 text-primary" />
                <span>حفظ كإعداد مسبق</span>
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>حفظ التوليفة الحالية كإعداد مسبق</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2 rounded-xl border border-border bg-muted/50 p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <strong>النموذج</strong>
                    <span className="font-bold text-foreground">{activeModel?.label ?? modelId}</span>
                  </div>
                  {/* Summarised from the active model's declared schema, so this
                      dialog needs no change when a model's knobs change. */}
                  {(activeModel?.params ?? []).map((spec) => (
                    <div key={spec.key} className="flex items-center justify-between gap-3">
                      <strong>{spec.label}</strong>
                      <span className="numeric font-bold text-foreground">
                        {(params[spec.key] ?? spec.default)}{spec.format ?? ''}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preset-name-input">اسم الإعداد المسبق</Label>
                  <Input 
                    id="preset-name-input"
                    value={presetName} 
                    onChange={(e) => setPresetName(e.target.value)} 
                    placeholder="مثال: صوت وثائقي هادئ"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>إلغاء</Button>
                <Button onClick={handleSavePreset} disabled={!presetName.trim() || isSavingPreset}>
                  {isSavingPreset ? 'جاري الحفظ...' : 'حفظ الإعداد'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </TooltipProvider>
  );
}
