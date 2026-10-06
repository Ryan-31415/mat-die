import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_PRESETS, AI_STORAGE_KEY, AI_LEGACY_STORAGE_KEY, AI_PRESET_IDS, changeAIParameters, createAISettings, loadAISettings, saveAISettings, selectAIPreset } from './ai';

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
describe('AI settings and storage', () => {
  it('defaults to medium and retains personality while switching presets', () => {
    const settings = createAISettings();
    settings.traits.aggression = { automatic: false, value: 1.7 };
    expect(settings.difficulty).toBe('medium');
    const custom = changeAIParameters(settings, { noise: 8 });
    expect(custom.difficulty).toBe('custom'); expect(custom.lastPreset).toBe('medium');
    const perfect = selectAIPreset(custom, 'perfect');
    expect(perfect.parameters).toEqual(AI_PRESETS.perfect);
    expect(perfect.traits.aggression).toEqual(settings.traits.aggression);
    expect(settings.parameters.noise).toBe(12);
  });
  it('clamps limits and keeps min/max pairs ordered in either direction', () => {
    let settings = changeAIParameters(createAISettings(), { reactionMin: 2000, precisionMin: 110 });
    expect([settings.parameters.reactionMin, settings.parameters.reactionMax]).toEqual([1000, 1000]);
    expect([settings.parameters.precisionMin, settings.parameters.precisionMax]).toEqual([100, 100]);
    settings = changeAIParameters(settings, { reactionMax: -10, precisionMax: -1 });
    expect([settings.parameters.reactionMin, settings.parameters.reactionMax]).toEqual([0, 0]);
    expect([settings.parameters.precisionMin, settings.parameters.precisionMax]).toEqual([0, 0]);
  });
  it('round trips manual/custom settings without saving runtime observations', () => {
    const settings = changeAIParameters(createAISettings(), { observationInterval: 123, hidden: 'temporary' });
    settings.traits.skill = { automatic: false, value: 0.4 };
    saveAISettings(settings); expect(loadAISettings()).toEqual(settings);
    expect(JSON.parse(localStorage.getItem(AI_STORAGE_KEY))).toEqual({ version: 2, settings });
  });
  it.each(['{', 'null', '{"version":2}', JSON.stringify({ version: 1, settings: { ...createAISettings(), parameters: { ...AI_PRESETS.medium, reactionMin: 1000, reactionMax: 100 } } })])('recovers malformed/stale storage %s', text => {
    localStorage.setItem(AI_STORAGE_KEY, text); expect(loadAISettings()).toEqual(createAISettings());
  });
  it('works when storage is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(loadAISettings()).toEqual(createAISettings());
    expect(() => saveAISettings(createAISettings())).not.toThrow();
  });
  it('restores older settings without the new adaptation field and clamps manual values', () => {
    const settings = changeAIParameters(createAISettings('hard'), { noise: 3 });
    const { controlAdaptation: _adaptation, estimation: _estimation, forecasts: _forecasts, inputs: _inputs, learningOptions: _learning, hiddenMemoryMs: _memory, hiddenAttacks: _attacks, information: _information, ...olderParameters } = settings.parameters;
    localStorage.setItem(AI_LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, settings: { ...settings, parameters: {
      ...olderParameters, internal: 'estimated', information: { resources: true, cooldowns: true, statuses: true, projectiles: true, hazards: true, environment: true },
    } } }));
    expect(loadAISettings()).toEqual({ ...settings, parameters: { ...settings.parameters, hiddenMemoryMs: 3000 } });
    expect(changeAIParameters(settings, { controlAdaptation: -10 }).parameters.controlAdaptation).toBe(0);
    expect(changeAIParameters(settings, { controlAdaptation: 110 }).parameters.controlAdaptation).toBe(100);
  });
});

describe('granular settings validation', () => {
  it('saves common delay inheritance and preserves older v2 individual delays', () => {
    const settings = changeAIParameters(createAISettings(), { inputDelayMaxMs: 2000 });
    settings.parameters.inputs.attack.useCommonDelay = true;
    expect(settings.parameters.inputDelayMaxMs).toBe(1000);
    saveAISettings(settings);
    expect(loadAISettings()).toEqual(settings);
    const { inputDelayMaxMs: _delay, ...parameters } = settings.parameters;
    const inputs = Object.fromEntries(Object.entries(parameters.inputs).map(([key, { useCommonDelay: _common, ...input }]) => [key, input]));
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({ version: 2, settings: { ...settings, parameters: { ...parameters, inputs } } }));
    const restored = loadAISettings().parameters;
    expect(restored.inputDelayMaxMs).toBe(0);
    for (const key of Object.keys(settings.parameters.inputs)) {
      expect(restored.inputs[key].useCommonDelay).toBe(false);
      expect(restored.inputs[key].delayMaxMs).toBe(settings.parameters.inputs[key].delayMaxMs);
    }
  });
  it('keeps nested presets independent and clamps every numeric group', () => {
    const original = createAISettings('hard'), changed = createAISettings('hard');
    changed.parameters.estimation.movement.errorPercent = 100;
    changed.parameters.forecasts.opponent.horizonMs = 2000;
    changed.parameters.inputs.attack.precisionMin = 0;
    expect(original.parameters).toEqual(AI_PRESETS.hard);
    const p = changed.parameters;
    const next = changeAIParameters(original, {
      hiddenMemoryMs: 50000,
      estimation: { ...p.estimation, movement: { mode: 'estimated', errorPercent: -1, rounding: 9000 }, durations: { mode: 'estimated', errorPercent: 101, rounding: 90000 } },
      forecasts: { ...p.forecasts, opponent: { horizonMs: 3000, positionError: 501, timingErrorMs: -1 } },
      inputs: { ...p.inputs, attack: { useCommonPrecision: false, useCommonDelay: false, precisionMin: 110, precisionMax: 20, delayMaxMs: 2000 } },
      learningOptions: { memoryMs: 0, sampleIntervalMs: 0, halfLifeMs: 50000 },
    });
    expect(next.parameters.hiddenMemoryMs).toBe(30000);
    expect(next.parameters.estimation.movement).toMatchObject({ errorPercent: 0, rounding: 2000 });
    expect(next.parameters.estimation.durations).toMatchObject({ errorPercent: 100, rounding: 30000 });
    expect(next.parameters.forecasts.opponent).toEqual({ horizonMs: 2000, positionError: 500, timingErrorMs: 0 });
    expect(next.parameters.inputs.attack).toMatchObject({ precisionMin: 100, precisionMax: 100, delayMaxMs: 1000 });
    expect(next.parameters.learningOptions).toEqual({ memoryMs: 1000, sampleIntervalMs: 50, halfLifeMs: 30000 });
    expect(original.parameters).toEqual(AI_PRESETS.hard);
    saveAISettings(next); expect(loadAISettings()).toEqual(next);
  });
  it.each(AI_PRESET_IDS)('persists all %s preset fields and restores stale preset labels to current values', preset => {
    const settings = createAISettings(preset);
    saveAISettings(settings); expect(loadAISettings()).toEqual(settings);
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({ version: 2, settings: { ...settings, parameters: { ...settings.parameters, noise: 99 } } }));
    expect(loadAISettings().parameters).toEqual(AI_PRESETS[preset]);
  });
  it('rejects invalid nested values and preserves zero precision and horizon values', () => {
    const settings = changeAIParameters(createAISettings(), { precisionMin: 0, precisionMax: 0 });
    settings.parameters.forecasts.opponent.horizonMs = 0;
    saveAISettings(settings); expect(loadAISettings()).toEqual(settings);
    settings.parameters.estimation.movement.errorPercent = NaN;
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({ version: 2, settings }));
    expect(loadAISettings()).toEqual(createAISettings());
  });
  it('migrates legacy masks, temporary memory and exact mode without granting new permissions', () => {
    const old = createAISettings('perfect');
    localStorage.setItem(AI_LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, settings: {
      ...old, difficulty: 'custom', parameters: {
        reactionMin: 17, reactionMax: 30, precisionMin: 40, precisionMax: 50, noise: 1, character: 80, prediction: 60, learning: 20,
        observationInterval: 100, internal: 'exact', hidden: 'temporary',
        information: { resources: false, cooldowns: false, statuses: false, projectiles: false, hazards: false, environment: false },
      },
    } }));
    const migrated = loadAISettings();
    expect(migrated.parameters).toMatchObject({ reactionMin: 17, precisionMin: 40, controlAdaptation: 100, hidden: 'temporary', hiddenMemoryMs: 3000, hiddenAttacks: 'exact' });
    expect(Object.values(migrated.parameters.information).every(value => !value)).toBe(true);
    expect(Object.values(migrated.parameters.estimation).every(value => value.mode === 'exact')).toBe(true);
    expect(migrated.traits).toEqual(old.traits);
    expect(JSON.parse(localStorage.getItem(AI_STORAGE_KEY)).version).toBe(2);
  });
});
