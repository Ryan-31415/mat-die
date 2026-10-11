import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MELEE_CHARACTERS, initializeMeleeScene, probeMeleeOpportunity } from '@/test/aiEvaluationMelee';
import { CHARACTERS } from '@/types/game';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import { evaluationConditions, readEvaluationManifest } from '@/test/aiEvaluationRunner';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });
describe('real-engine melee opportunity controls', () => {
  for (const character of MELEE_CHARACTERS) for (const side of [1, 2] as const) it.each([false, true])(
    `${character}/P${side} actually permits the resource panel skill: armed=%s`, armed => {
      vi.useFakeTimers(); vi.setSystemTime(10000);
      const game = renderHook(() => useGameEngine(CHARACTERS[side === 1 ? character : 'gladiator'],
        CHARACTERS[side === 2 ? character : 'gladiator'], 3, () => {}, 'multi', false, 1, 'wasteland'));
      const state = game.result.current.gameState;
      initializeMeleeScene(state, armed ? 'armed-enemy-ready' : 'enemy-ready', side, 10000, 'wasteland');
      expect(state.players[side - 1].mana).toBe(armed ? 60 : 0);
      expect(state.players[side === 1 ? 1 : 0].mana).toBe(0);
      act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), g: side === 1, enter: side === 2 } }));
      act(() => { vi.advanceTimersByTime(17); });
      const self = game.result.current.gameState.players[side - 1];
      expect(character === 'gladiator' ? self.isShielding : self.skillCooldownRemaining > 0).toBe(armed);
    });
  it('rejects lower-difficulty performance manifests while allowing compatibility smoke', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mat-die-eval-policy-'));
    const path = join(directory, 'manifest.json');
    const base = { schemaVersion: 1, mode: 'duel', characters: ['ninja'], maps: ['wasteland'],
      seeds: [731], roundSeconds: 60, startTime: 10000, expectedGames: 2 };
    try {
      for (const seedNamespace of ['development', 'final']) for (const preset of ['easy', 'medium', 'hard']) {
        writeFileSync(path, JSON.stringify({ ...base, seedNamespace, presets: [preset] }));
        expect(() => readEvaluationManifest(path)).toThrow(/perfect difficulty only/);
      }
      writeFileSync(path, JSON.stringify({ ...base, seedNamespace: 'smoke', presets: ['medium'] }));
      expect(readEvaluationManifest(path).presets).toEqual(['medium']);
    } finally { unlinkSync(path); rmdirSync(directory); }
  });
  it.each(MELEE_CHARACTERS)('uses actual strict collision boundaries for %s on both sides', character => {
    vi.useFakeTimers();
    for (const side of [1, 2] as const) {
      expect(probeMeleeOpportunity(character, 'edge-in', side, 'wasteland', 731, 10000)).toMatchObject({ eligible: true, oracleReceivedDamage: 0 });
      expect(probeMeleeOpportunity(character, 'edge-touch', side, 'wasteland', 731, 10000)).toMatchObject({ eligible: false, oracleDamage: 0 });
      expect(probeMeleeOpportunity(character, 'edge-out', side, 'wasteland', 731, 10000)).toMatchObject({ eligible: false, oracleDamage: 0 });
    }
  });
  it('excludes front shields and harmful pools but retains attacks behind a shield', () => {
    vi.useFakeTimers();
    expect(probeMeleeOpportunity('gladiator', 'shield-front', 1, 'wasteland', 731, 10000).eligible).toBe(false);
    expect(probeMeleeOpportunity('gladiator', 'shield-back', 1, 'wasteland', 731, 10000).eligible).toBe(true);
    expect(probeMeleeOpportunity('gladiator', 'pool', 1, 'wasteland', 731, 10000).oracleReceivedDamage).toBeGreaterThan(0);
  });
  it('keeps the runner and external coverage enumerator identical', async () => {
    const external = await import('../../../scripts/summarize-ai-evaluation.mjs');
    for (const name of ['smoke', 'development', 'final', 'paired-smoke', 'session-smoke', 'melee-smoke', 'melee-development', 's4-resources']) {
      const path = `scripts/fixtures/ai-eval-${name}.json`;
      const manifest = readEvaluationManifest(path);
      const rows = evaluationConditions(manifest);
      expect(rows.map(({ id, ...condition }) => [id, condition])).toEqual([...external.expectedConditions(JSON.parse(readFileSync(path, 'utf8')))]);
    }
  });
});
