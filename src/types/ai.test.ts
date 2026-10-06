import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_PRESETS, AI_STORAGE_KEY, changeAIParameters, createAISettings, loadAISettings, saveAISettings, selectAIPreset } from './ai';

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
    expect(JSON.parse(localStorage.getItem(AI_STORAGE_KEY))).toEqual({ version: 1, settings });
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
    const { controlAdaptation: _adaptation, ...olderParameters } = settings.parameters;
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({ version: 1, settings: { ...settings, parameters: olderParameters } }));
    expect(loadAISettings()).toEqual(settings);
    expect(changeAIParameters(settings, { controlAdaptation: -10 }).parameters.controlAdaptation).toBe(0);
    expect(changeAIParameters(settings, { controlAdaptation: 110 }).parameters.controlAdaptation).toBe(100);
  });
});
