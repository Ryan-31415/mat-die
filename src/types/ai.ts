import { z } from 'zod';

export const AI_PRESET_IDS = ['easy', 'medium', 'hard', 'perfect'] as const;
export type AIPreset = typeof AI_PRESET_IDS[number];
export const AI_PRESET_LABELS: Record<AIPreset | 'custom', string> = {
  easy: '하급', medium: '중급', hard: '상급', perfect: '완전', custom: '사용자 지정',
};
export const AI_PRESET_COLORS: Record<AIPreset | 'custom', string> = {
  easy: 'linear-gradient(90deg, #16a34a, #22c55e)', medium: 'linear-gradient(90deg, #facc15, #fde047)',
  hard: 'linear-gradient(90deg, #ef4444, #f97316)', perfect: 'linear-gradient(90deg, #1e40af, #7c3aed)',
  custom: 'linear-gradient(90deg, #6b7280, #9ca3af)',
};
export const AI_INFO_LABELS = {
  resources: '상대 체력·마나', cooldowns: '상대 쿨다운 표시', statuses: '상대 상태 표시',
  projectiles: '투사체', hazards: '위험 지대', environment: '맵 효과',
} as const;
export type AIInfoKey = keyof typeof AI_INFO_LABELS;
export const AI_TRAIT_LABELS = {
  aggression: '공격성', skill: '스킬 선호도', ultimate: '궁극기 선호도',
  defense: '방어·회피', spacing: '거리 유지', recovery: '회복·자원 보존',
} as const;
export type AITrait = keyof typeof AI_TRAIT_LABELS;
export type AITraits = Record<AITrait, number>;
export const NEUTRAL_AI_TRAITS: AITraits = { aggression: 1, skill: 1, ultimate: 1, defense: 1, spacing: 1, recovery: 1 };
export interface AIParameters {
  reactionMin: number;
  reactionMax: number;
  precisionMin: number;
  precisionMax: number;
  noise: number;
  character: number;
  prediction: number;
  learning: number;
  controlAdaptation: number;
  observationInterval: number;
  internal: 'none' | 'estimated' | 'exact';
  hidden: 'temporary' | 'remembered' | 'all';
  information: Record<AIInfoKey, boolean>;
}
export interface AISettings {
  difficulty: AIPreset | 'custom';
  lastPreset: AIPreset;
  parameters: AIParameters;
  traits: Record<AITrait, { automatic: boolean; value: number }>;
}
export interface AIDecisionOptions {
  parameters: AIParameters;
  traits: AITraits;
  random: () => number;
}
const information = { resources: true, cooldowns: true, statuses: true, projectiles: true, hazards: true, environment: true };
export const AI_PRESETS: Record<AIPreset, AIParameters> = {
  easy: { reactionMin: 250, reactionMax: 350, precisionMin: 65, precisionMax: 85, noise: 35, character: 40, prediction: 25, learning: 0, controlAdaptation: 25, observationInterval: 150, internal: 'estimated', hidden: 'remembered', information: { ...information } },
  medium: { reactionMin: 175, reactionMax: 225, precisionMin: 85, precisionMax: 95, noise: 12, character: 70, prediction: 50, learning: 25, controlAdaptation: 60, observationInterval: 50, internal: 'estimated', hidden: 'remembered', information: { ...information } },
  hard: { reactionMin: 100, reactionMax: 150, precisionMin: 97, precisionMax: 100, noise: 2, character: 100, prediction: 100, learning: 100, controlAdaptation: 100, observationInterval: 0, internal: 'estimated', hidden: 'remembered', information: { ...information } },
  perfect: { reactionMin: 0, reactionMax: 0, precisionMin: 100, precisionMax: 100, noise: 0, character: 100, prediction: 100, learning: 100, controlAdaptation: 100, observationInterval: 0, internal: 'exact', hidden: 'all', information: { ...information } },
};
export const createAISettings = (preset: AIPreset = 'medium'): AISettings => ({
  difficulty: preset, lastPreset: preset, parameters: { ...AI_PRESETS[preset], information: { ...information } },
  traits: {
    aggression: { automatic: true, value: 1 }, skill: { automatic: true, value: 1 }, ultimate: { automatic: true, value: 1 },
    defense: { automatic: true, value: 1 }, spacing: { automatic: true, value: 1 }, recovery: { automatic: true, value: 1 },
  },
});
export const selectAIPreset = (settings: AISettings, preset: AIPreset): AISettings => ({
  ...settings, difficulty: preset, lastPreset: preset,
  parameters: { ...AI_PRESETS[preset], information: { ...information } },
});
export function changeAIParameters(settings: AISettings, changes: Partial<AIParameters>): AISettings {
  const parameters = { ...settings.parameters, ...changes };
  for (const key of ['reactionMin', 'reactionMax', 'observationInterval'] as const) parameters[key] = Math.max(0, Math.min(1000, parameters[key]));
  for (const key of ['precisionMin', 'precisionMax', 'noise', 'character', 'prediction', 'learning', 'controlAdaptation'] as const) parameters[key] = Math.max(0, Math.min(100, parameters[key]));
  if (parameters.reactionMin > parameters.reactionMax) {
    if (changes.reactionMin !== undefined) parameters.reactionMax = parameters.reactionMin;
    else parameters.reactionMin = parameters.reactionMax;
  }
  if (parameters.precisionMin > parameters.precisionMax) {
    if (changes.precisionMin !== undefined) parameters.precisionMax = parameters.precisionMin;
    else parameters.precisionMin = parameters.precisionMax;
  }
  return { ...settings, difficulty: 'custom', parameters };
}

const percent = z.number().finite().min(0).max(100);
const milliseconds = z.number().finite().min(0).max(1000);
const trait = z.object({ automatic: z.boolean(), value: z.number().finite().min(0).max(2) });
const storedSettings = z.object({
  version: z.literal(1),
  settings: z.object({
    difficulty: z.enum(['easy', 'medium', 'hard', 'perfect', 'custom']), lastPreset: z.enum(AI_PRESET_IDS),
    parameters: z.object({
      reactionMin: milliseconds, reactionMax: milliseconds, precisionMin: percent, precisionMax: percent,
      noise: percent, character: percent, prediction: percent, learning: percent, observationInterval: milliseconds,
      controlAdaptation: percent.optional(),
      internal: z.enum(['none', 'estimated', 'exact']), hidden: z.enum(['temporary', 'remembered', 'all']),
      information: z.object({ resources: z.boolean(), cooldowns: z.boolean(), statuses: z.boolean(), projectiles: z.boolean(), hazards: z.boolean(), environment: z.boolean() }),
    }).refine(p => p.reactionMin <= p.reactionMax && p.precisionMin <= p.precisionMax),
    traits: z.object({ aggression: trait, skill: trait, ultimate: trait, defense: trait, spacing: trait, recovery: trait }),
  }),
});
export const AI_STORAGE_KEY = 'mat-die.ai-settings.v1';
export function loadAISettings(): AISettings {
  try {
    const parsed = storedSettings.safeParse(JSON.parse(localStorage.getItem(AI_STORAGE_KEY) ?? 'null'));
    if (parsed.success) {
      const saved = parsed.data.settings;
      const defaults = createAISettings();
      const settings: AISettings = {
        ...defaults, ...saved,
        parameters: { ...defaults.parameters, ...saved.parameters, controlAdaptation: saved.parameters.controlAdaptation ?? AI_PRESETS[saved.lastPreset].controlAdaptation, information: { ...defaults.parameters.information, ...saved.parameters.information } },
        traits: { ...defaults.traits },
      };
      for (const name of Object.keys(AI_TRAIT_LABELS) as AITrait[]) settings.traits[name] = { ...defaults.traits[name], ...saved.traits[name] };
      // Preset labels always describe the actual preset, even after a stale save.
      return settings.difficulty === 'custom' ? settings : selectAIPreset(settings, settings.difficulty);
    }
  } catch { /* Storage can be unavailable in private or embedded browsers. */ }
  return createAISettings();
}
export function saveAISettings(settings: AISettings): void {
  try { localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({ version: 1, settings })); }
  catch { /* Settings still work for this session when storage is unavailable. */ }
}
