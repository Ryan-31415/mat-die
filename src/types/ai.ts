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
  health: '상대 체력', mana: '상대 마나', attackCooldowns: '기본 공격 쿨다운 추정', skillCooldowns: '스킬 쿨다운',
  statuses: '상대 상태 표시', statusTimers: '상대 상태 시간', projectiles: '투사체', meleeHitboxes: '근접 판정',
  hazards: '위험 지대', wind: '바람', lightning: '번개', recoveryZones: '회복 지대', vines: '덩굴',
} as const;
export type AIInfoKey = keyof typeof AI_INFO_LABELS;
export const AI_ESTIMATION_LABELS = { movement: '이동', cooldowns: '쿨다운', durations: '지속시간', effects: '효과 강도', properties: '투사체·위험 지대 특성' } as const;
export type AIEstimationKey = keyof typeof AI_ESTIMATION_LABELS;
export const AI_FORECAST_LABELS = { opponent: '상대 움직임', projectiles: '투사체 궤적', environment: '환경 위험' } as const;
export type AIForecastKey = keyof typeof AI_FORECAST_LABELS;
export const AI_INPUT_LABELS = { movement: '이동 입력', jump: '점프·하강 입력', attack: '기본 공격 입력', skill: '스킬 입력', ultimate: '궁극기 입력' } as const;
export type AIInputKey = keyof typeof AI_INPUT_LABELS;
export const AI_INTERNAL_MODES = ['none', 'estimated', 'exact'] as const;
export const AI_HIDDEN_MODES = ['none', 'visible', 'temporary', 'remembered', 'all'] as const;
export const AI_ATTACK_MODES = ['none', 'inferred', 'exact'] as const;
export type AIInternalMode = typeof AI_INTERNAL_MODES[number];
export interface AIEstimation { mode: AIInternalMode; errorPercent: number; rounding: number }
export interface AIForecast { horizonMs: number; positionError: number; timingErrorMs: number }
export type AIForecasts = Record<AIForecastKey, AIForecast>;
export interface AIInput { useCommonPrecision: boolean; useCommonDelay: boolean; precisionMin: number; precisionMax: number; delayMaxMs: number }
export interface AILearningParameters { memoryMs: number; sampleIntervalMs: number; halfLifeMs: number }
export const AI_TRAIT_LABELS = {
  aggression: '공격성', skill: '스킬 선호도', ultimate: '궁극기 선호도',
  defense: '방어·회피', spacing: '거리 유지', recovery: '회복·자원 보존',
} as const;
export type AITrait = keyof typeof AI_TRAIT_LABELS;
export type AITraits = Record<AITrait, number>;
export const NEUTRAL_AI_TRAITS: AITraits = { aggression: 1, skill: 1, ultimate: 1, defense: 1, spacing: 1, recovery: 1 };

export interface AIParameters {
  reactionMin: number; reactionMax: number; precisionMin: number; precisionMax: number; inputDelayMaxMs: number;
  noise: number; character: number; prediction: number; learning: number; controlAdaptation: number; observationInterval: number;
  hidden: typeof AI_HIDDEN_MODES[number]; hiddenMemoryMs: number; hiddenAttacks: typeof AI_ATTACK_MODES[number];
  estimation: Record<AIEstimationKey, AIEstimation>; forecasts: AIForecasts; inputs: Record<AIInputKey, AIInput>;
  learningOptions: AILearningParameters; information: Record<AIInfoKey, boolean>;
}
export interface AISettings {
  difficulty: AIPreset | 'custom'; lastPreset: AIPreset; parameters: AIParameters;
  traits: Record<AITrait, { automatic: boolean; value: number }>;
}
export interface AIDecisionOptions { parameters: AIParameters; traits: AITraits; random: () => number }
const information: Record<AIInfoKey, boolean> = {
  health: true, mana: true, attackCooldowns: true, skillCooldowns: true, statuses: true, statusTimers: true,
  projectiles: true, meleeHitboxes: true, hazards: true, wind: true, lightning: true, recoveryZones: true, vines: true,
};
function preset(index: number, base: Pick<AIParameters, 'reactionMin' | 'reactionMax' | 'precisionMin' | 'precisionMax' | 'noise' | 'character' | 'prediction' | 'learning' | 'controlAdaptation' | 'observationInterval'>): AIParameters {
  const mode: AIInternalMode = index === 3 ? 'exact' : 'estimated';
  const errorPercent = [25, 10, 2, 0][index];
  const estimate = (rounding: number): AIEstimation => ({ mode, errorPercent, rounding });
  const forecast = (positionError: number): AIForecast => ({ horizonMs: [300, 600, 1000, 2000][index], positionError, timingErrorMs: [150, 60, 15, 0][index] });
  const input = (delayMaxMs: number): AIInput => ({ useCommonPrecision: true, useCommonDelay: false, precisionMin: base.precisionMin, precisionMax: base.precisionMax, delayMaxMs });
  return {
    ...base, inputDelayMaxMs: [45, 20, 5, 0][index], information: { ...information }, hidden: index < 2 ? 'temporary' : index === 2 ? 'remembered' : 'all',
    hiddenMemoryMs: [1500, 5000, 10000, 10000][index], hiddenAttacks: index === 3 ? 'exact' : 'inferred',
    estimation: { movement: estimate([50, 20, 5, 0][index]), cooldowns: estimate([200, 100, 25, 0][index]), durations: estimate([250, 100, 25, 0][index]), effects: estimate([5, 2, 1, 0][index]), properties: estimate([5, 2, 0.5, 0][index]) },
    forecasts: { opponent: forecast([80, 30, 6, 0][index]), projectiles: forecast([60, 20, 4, 0][index]), environment: forecast([40, 15, 3, 0][index]) },
    inputs: { movement: input([20, 8, 1, 0][index]), jump: input([35, 15, 3, 0][index]), attack: input([30, 12, 3, 0][index]), skill: input([40, 18, 4, 0][index]), ultimate: input([45, 20, 5, 0][index]) },
    learningOptions: { memoryMs: [2000, 5000, 8000, 12000][index], sampleIntervalMs: [150, 100, 50, 50][index], halfLifeMs: [3000, 7000, 10000, 15000][index] },
  };
}
export const AI_PRESETS: Record<AIPreset, AIParameters> = {
  easy: preset(0, { reactionMin: 250, reactionMax: 350, precisionMin: 65, precisionMax: 80, noise: 50, character: 25, prediction: 15, learning: 0, controlAdaptation: 15, observationInterval: 250 }),
  medium: preset(1, { reactionMin: 175, reactionMax: 225, precisionMin: 85, precisionMax: 95, noise: 16, character: 60, prediction: 40, learning: 25, controlAdaptation: 50, observationInterval: 100 }),
  hard: preset(2, { reactionMin: 100, reactionMax: 150, precisionMin: 98, precisionMax: 100, noise: 2, character: 100, prediction: 100, learning: 100, controlAdaptation: 100, observationInterval: 0 }),
  perfect: preset(3, { reactionMin: 0, reactionMax: 0, precisionMin: 100, precisionMax: 100, noise: 0, character: 100, prediction: 100, learning: 100, controlAdaptation: 100, observationInterval: 0 }),
};
export function cloneAIParameters(p: AIParameters): AIParameters {
  return {
    ...p, information: { ...p.information }, learningOptions: { ...p.learningOptions },
    estimation: { movement: { ...p.estimation.movement }, cooldowns: { ...p.estimation.cooldowns }, durations: { ...p.estimation.durations }, effects: { ...p.estimation.effects }, properties: { ...p.estimation.properties } },
    forecasts: { opponent: { ...p.forecasts.opponent }, projectiles: { ...p.forecasts.projectiles }, environment: { ...p.forecasts.environment } },
    inputs: { movement: { ...p.inputs.movement }, jump: { ...p.inputs.jump }, attack: { ...p.inputs.attack }, skill: { ...p.inputs.skill }, ultimate: { ...p.inputs.ultimate } },
  };
}
export const createAISettings = (preset: AIPreset = 'medium'): AISettings => ({
  difficulty: preset, lastPreset: preset, parameters: cloneAIParameters(AI_PRESETS[preset]),
  traits: {
    aggression: { automatic: true, value: 1 }, skill: { automatic: true, value: 1 }, ultimate: { automatic: true, value: 1 },
    defense: { automatic: true, value: 1 }, spacing: { automatic: true, value: 1 }, recovery: { automatic: true, value: 1 },
  },
});
export const selectAIPreset = (settings: AISettings, preset: AIPreset): AISettings => ({
  ...settings, difficulty: preset, lastPreset: preset, parameters: cloneAIParameters(AI_PRESETS[preset]),
});
const bounded = (value: number, min: number, max: number, fallback: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
function ordered(min: number, max: number, minChanged: boolean): [number, number] {
  return min <= max ? [min, max] : minChanged ? [min, min] : [max, max];
}
export function changeAIParameters(settings: AISettings, changes: Partial<AIParameters>): AISettings {
  const old = settings.parameters;
  const p = cloneAIParameters({ ...old, ...changes });
  for (const key of ['reactionMin', 'reactionMax', 'observationInterval', 'inputDelayMaxMs'] as const) p[key] = bounded(p[key], 0, 1000, old[key]);
  for (const key of ['precisionMin', 'precisionMax', 'noise', 'character', 'prediction', 'learning', 'controlAdaptation'] as const) p[key] = bounded(p[key], 0, 100, old[key]);
  [p.reactionMin, p.reactionMax] = ordered(p.reactionMin, p.reactionMax, changes.reactionMin !== undefined);
  [p.precisionMin, p.precisionMax] = ordered(p.precisionMin, p.precisionMax, changes.precisionMin !== undefined);
  p.hiddenMemoryMs = bounded(p.hiddenMemoryMs, 0, 30000, old.hiddenMemoryMs);
  for (const key of Object.keys(AI_ESTIMATION_LABELS) as AIEstimationKey[]) {
    const e = p.estimation[key];
    e.errorPercent = bounded(e.errorPercent, 0, 100, old.estimation[key].errorPercent);
    e.rounding = bounded(e.rounding, 0, key === 'durations' || key === 'cooldowns' ? 30000 : key === 'movement' ? 2000 : 100, old.estimation[key].rounding);
  }
  for (const key of Object.keys(AI_FORECAST_LABELS) as AIForecastKey[]) {
    const f = p.forecasts[key];
    f.horizonMs = bounded(f.horizonMs, 0, 2000, old.forecasts[key].horizonMs);
    f.positionError = bounded(f.positionError, 0, 500, old.forecasts[key].positionError);
    f.timingErrorMs = bounded(f.timingErrorMs, 0, 1000, old.forecasts[key].timingErrorMs);
  }
  for (const key of Object.keys(AI_INPUT_LABELS) as AIInputKey[]) {
    const i = p.inputs[key];
    i.precisionMin = bounded(i.precisionMin, 0, 100, old.inputs[key].precisionMin);
    i.precisionMax = bounded(i.precisionMax, 0, 100, old.inputs[key].precisionMax);
    [i.precisionMin, i.precisionMax] = ordered(i.precisionMin, i.precisionMax, i.precisionMin !== old.inputs[key].precisionMin);
    i.delayMaxMs = bounded(i.delayMaxMs, 0, 1000, old.inputs[key].delayMaxMs);
  }
  p.learningOptions.memoryMs = bounded(p.learningOptions.memoryMs, 1000, 30000, old.learningOptions.memoryMs);
  p.learningOptions.sampleIntervalMs = bounded(p.learningOptions.sampleIntervalMs, 50, 1000, old.learningOptions.sampleIntervalMs);
  p.learningOptions.halfLifeMs = bounded(p.learningOptions.halfLifeMs, 1000, 30000, old.learningOptions.halfLifeMs);
  return { ...settings, difficulty: 'custom', parameters: p };
}
const percent = z.number().finite().min(0).max(100);
const milliseconds = z.number().finite().min(0).max(1000);
const trait = z.object({ automatic: z.boolean(), value: z.number().finite().min(0).max(2) });
const legacySettings = z.object({
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

const estimationSchema = (max: number) => z.object({ mode: z.enum(AI_INTERNAL_MODES), errorPercent: percent, rounding: z.number().finite().min(0).max(max) });
const forecastSchema = z.object({ horizonMs: z.number().finite().min(0).max(2000), positionError: z.number().finite().min(0).max(500), timingErrorMs: milliseconds });
const inputSchema = z.object({ useCommonPrecision: z.boolean(), useCommonDelay: z.boolean().default(false), precisionMin: percent, precisionMax: percent, delayMaxMs: milliseconds }).refine(p => p.precisionMin <= p.precisionMax);
const longTime = z.number().finite().min(1000).max(30000);
const storedSettings = z.object({
  version: z.literal(2),
  settings: legacySettings.shape.settings.extend({
    parameters: z.object({
      reactionMin: milliseconds, reactionMax: milliseconds, precisionMin: percent, precisionMax: percent,
      inputDelayMaxMs: milliseconds.default(0),
      noise: percent, character: percent, prediction: percent, learning: percent, observationInterval: milliseconds, controlAdaptation: percent,
      hidden: z.enum(AI_HIDDEN_MODES), hiddenMemoryMs: z.number().finite().min(0).max(30000), hiddenAttacks: z.enum(AI_ATTACK_MODES),
      estimation: z.object({ movement: estimationSchema(2000), cooldowns: estimationSchema(30000), durations: estimationSchema(30000), effects: estimationSchema(100), properties: estimationSchema(100) }),
      forecasts: z.object({ opponent: forecastSchema, projectiles: forecastSchema, environment: forecastSchema }),
      inputs: z.object({ movement: inputSchema, jump: inputSchema, attack: inputSchema, skill: inputSchema, ultimate: inputSchema }),
      learningOptions: z.object({ memoryMs: longTime, sampleIntervalMs: z.number().finite().min(50).max(1000), halfLifeMs: longTime }),
      information: z.object({
        health: z.boolean(), mana: z.boolean(), attackCooldowns: z.boolean(), skillCooldowns: z.boolean(), statuses: z.boolean(), statusTimers: z.boolean(),
        projectiles: z.boolean(), meleeHitboxes: z.boolean(), hazards: z.boolean(), wind: z.boolean(), lightning: z.boolean(), recoveryZones: z.boolean(), vines: z.boolean(),
      }),
    }).refine(p => p.reactionMin <= p.reactionMax && p.precisionMin <= p.precisionMax),
  }),
});
export const AI_STORAGE_KEY = 'mat-die.ai-settings.v2';
export const AI_LEGACY_STORAGE_KEY = 'mat-die.ai-settings.v1';
export function loadAISettings(): AISettings {
  try {
    const current = localStorage.getItem(AI_STORAGE_KEY);
    if (current !== null) {
      const parsed = storedSettings.safeParse(JSON.parse(current));
      if (parsed.success) {
        const settings = createAISettings(parsed.data.settings.lastPreset);
        Object.assign(settings, parsed.data.settings);
        return settings.difficulty === 'custom' ? settings : selectAIPreset(settings, settings.difficulty);
      }
    }
    const legacy = legacySettings.safeParse(JSON.parse(localStorage.getItem(AI_LEGACY_STORAGE_KEY) ?? 'null'));
    if (legacy.success) {
      const saved = legacy.data.settings;
      const p = cloneAIParameters(AI_PRESETS[saved.lastPreset]);
      const { internal, information: info, ...values } = saved.parameters;
      Object.assign(p, values, { controlAdaptation: saved.parameters.controlAdaptation ?? p.controlAdaptation });
      for (const key of Object.keys(AI_ESTIMATION_LABELS) as AIEstimationKey[]) p.estimation[key].mode = internal;
      p.hiddenMemoryMs = 3000;
      p.hiddenAttacks = internal === 'exact' ? 'exact' : 'inferred';
      p.information = {
        health: info.resources, mana: info.resources, attackCooldowns: info.cooldowns, skillCooldowns: info.cooldowns,
        statuses: info.statuses, statusTimers: info.statuses, projectiles: info.projectiles, meleeHitboxes: info.projectiles,
        hazards: info.hazards, wind: info.environment, lightning: info.environment, recoveryZones: info.environment, vines: info.environment,
      };
      const migrated = createAISettings(saved.lastPreset);
      Object.assign(migrated, saved, { parameters: p });
      const settings = migrated.difficulty === 'custom' ? migrated : selectAIPreset(migrated, migrated.difficulty);
      saveAISettings(settings);
      return settings;
    }
  } catch { /* Storage can be unavailable in private or embedded browsers. */ }
  return createAISettings();
}
export function saveAISettings(settings: AISettings): void {
  try { localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({ version: 2, settings })); }
  catch { /* Settings still work for this session when storage is unavailable. */ }
}
