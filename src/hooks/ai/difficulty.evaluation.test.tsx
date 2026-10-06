import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setImmediate as yieldToRunner } from 'node:timers/promises';
import { createAISettings, type AIPreset } from '@/types/ai';
import { CHARACTERS, type CharacterType } from '@/types/game';
import { MAPS, type MapId } from '@/types/map';
import { useGameEngine } from '../useGameEngine';
import { createDifficultySession } from './difficulty';
import { createAILearningSession } from './state';
import { emptyAIKeys } from './controller';
import { overlapsPlayer } from './world';

interface Result {
  configuration: string; character: CharacterType; map: MapId; pattern: string; seed: number;
  winner: 1 | 2 | 'draw' | null; dealt: number; received: number; attempts: number; hits: number;
  environmentDamage: number; longestStallSeconds: number; meanTickMs: number; p95TickMs: number;
}
describe.skipIf(process.env.RUN_AI_DIFFICULTY_EVALUATION !== '1')('granular preset combat evaluation', () => {
  it('compares perfect 800ms/2000ms in the real difficulty path', async () => {
    const requestedCharacters = process.env.AI_EVALUATION_CHARACTERS?.split(',');
    const characters = (Object.keys(CHARACTERS) as CharacterType[]).filter(character => !requestedCharacters || requestedCharacters.includes(character));
    const maps = Object.keys(MAPS) as MapId[];
    expect(characters.length).toBeGreaterThan(0);
    const available: { name: string; preset: AIPreset; horizon?: number }[] = [
      { name: 'perfect', preset: 'perfect' }, { name: 'perfect-800ms', preset: 'perfect', horizon: 800 },
    ];
    const selection = process.env.AI_EVALUATION_CONFIGURATION;
    const configurations = available.filter(config => !selection || config.name === selection);
    expect(configurations.length).toBeGreaterThan(0);
    const expected = configurations.length * characters.length * maps.length * 3 * 2;
    const suffix = selection ? '-' + selection : '';
    const seeds = [731, 1907], maxRoundSeconds = 5, results: Result[] = [];
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random');
    const logger = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      for (const config of configurations) for (const character of characters) for (const map of maps) for (const pattern of ['strafe', 'jump', 'rush']) for (const seed of seeds) {
        let rng = seed;
        random.mockImplementation(() => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; });
        const start = 1791158400000; vi.setSystemTime(start);
        const settings = createAISettings(config.preset);
        if (config.horizon !== undefined) for (const forecast of Object.values(settings.parameters.forecasts)) forecast.horizonMs = config.horizon;
        const learning = { current: { ...createAILearningSession(), difficulty: createDifficultySession(seed) } };
        const enemy = pattern === 'rush' ? 'gladiator' : pattern === 'jump' ? 'ninja' : 'archer';
        const game = renderHook(() => useGameEngine(CHARACTERS[enemy], CHARACTERS[character], maxRoundSeconds, vi.fn(), 'single', false, 1, map, learning, true, settings));
        const keys = { current: emptyAIKeys() }; act(() => game.result.current.setKeysRef(keys));
        let lastProgress = start, longestStall = 0;
        let anchor = { x: game.result.current.gameState.players[1].x, y: game.result.current.gameState.players[1].y };
        const samples: number[] = [];
        for (let tick = 0; tick < 1000 && game.result.current.gameState.isRoundActive; tick++) {
          const state = game.result.current.gameState, [human, ai] = state.players;
          const elapsed = Date.now() - start, toward = ai.x > human.x ? 1 : -1;
          let direction = pattern === 'rush' ? toward : Math.floor(elapsed / 1300) % 2 ? -1 : 1;
          if (human.x < 45) direction = 1; if (human.x > 715) direction = -1;
          keys.current.a = direction < 0; keys.current.d = direction > 0;
          keys.current.w = pattern === 'jump' ? elapsed % 750 < 80 : map === 'volcano' && human.isGrounded && elapsed % 900 < 80;
          keys.current.f = true; keys.current.g = pattern === 'strafe' || (pattern === 'rush' && Math.abs(ai.x - human.x) < 140 && elapsed % 1300 < 450);
          keys.current.h = true;
          const before = performance.now(); act(() => { vi.advanceTimersByTime(17); });
          if (tick > 30) samples.push(performance.now() - before);
          const next = game.result.current.gameState, moved = next.players[1];
          const disabled = moved.isStunned || moved.isFrozen || moved.rootDuration > 0;
          const recovering = next.aiState.difficulty?.memory?.strategy === 'recover' && next.soulZones.some(zone => Date.now() - zone.createdAt < zone.duration && overlapsPlayer(moved, zone));
          const waiting = recovering || (Math.abs(human.y - moved.y) < 40 && Math.abs(human.x - moved.x) < CHARACTERS[character].attackRange);
          if (disabled || waiting || Math.hypot(moved.x - anchor.x, moved.y - anchor.y) > 40) { anchor = { x: moved.x, y: moved.y }; lastProgress = Date.now(); }
          longestStall = Math.max(longestStall, Date.now() - lastProgress);
        }
        const final = game.result.current.gameState, metrics = final.diagnostics;
        samples.sort((a, b) => a - b);
        results.push({ configuration: config.name, character, map, pattern, seed, winner: final.roundWinner,
          dealt: metrics.directDamage[1], received: metrics.directDamage[0], attempts: metrics.attempts[1], hits: metrics.hits[1],
          environmentDamage: metrics.environmentDamage[1], longestStallSeconds: longestStall / 1000,
          meanTickMs: samples.reduce((a, b) => a + b, 0) / samples.length, p95TickMs: samples[Math.floor(samples.length * 0.95)] ?? 0 });
        game.unmount(); vi.clearAllTimers(); await yieldToRunner();
        if (results.length % 30 === 0) {
          mkdirSync('docs', { recursive: true });
          writeFileSync('docs/ai-difficulty-evaluation' + suffix + '-progress.json', JSON.stringify({ seeds, maxRoundSeconds, completed: results.length, expected, results }, null, 2) + '\n');
          process.stdout.write('Difficulty evaluation: ' + results.length + '/' + expected + ' games\n');
        }
      }
    } finally { logger.mockRestore(); random.mockRestore(); vi.useRealTimers(); }
    const summarize = (runs: Result[]) => {
      const sum = (key: 'dealt' | 'received' | 'attempts' | 'hits') => runs.reduce((total, row) => total + row[key], 0);
      return { games: runs.length, wins: runs.filter(r => r.winner === 2).length, dealt: sum('dealt'), received: sum('received'),
        hitRate: sum('attempts') ? sum('hits') / sum('attempts') : 0, stallsOverThreeSeconds: runs.filter(r => r.longestStallSeconds > 3).length,
        meanTickMs: runs.reduce((sum, r) => sum + r.meanTickMs, 0) / runs.length, worstScenarioP95TickMs: Math.max(...runs.map(r => r.p95TickMs)) };
    };
    const summaries = configurations.map(config => ({ configuration: config.name, ...summarize(results.filter(r => r.configuration === config.name)),
      characters: characters.map(character => ({ character, ...summarize(results.filter(r => r.configuration === config.name && r.character === character)) })) }));
    mkdirSync('docs', { recursive: true });
    writeFileSync('docs/ai-difficulty-evaluation' + suffix + '.json', JSON.stringify({ measuredAt: new Date().toISOString(), seeds, maxRoundSeconds,
      characters, maps, configurations: configurations.map(config => config.name),
      methodology: 'Real engine with AISettings and seeded DifficultySession. Selected perfect configurations and characters, five maps, three scripted opponent patterns, two seeds. Five-second scenarios cover immediate combat and two-second prediction; they do not measure long-term learning. Timings include React hook updates and exclude browser rendering. Direct damage excludes damage over time and zones. Stall excludes immobilization, attack-range waiting and active soul-zone recovery.', summaries, results }, null, 2) + '\n');
    process.stdout.write(JSON.stringify(summaries.map(({ characters: _characters, ...summary }) => summary), null, 2) + '\n');
    expect(results).toHaveLength(expected);
    expect(results.every(r => r.winner !== null && Number.isFinite(r.meanTickMs))).toBe(true);
  }, 1800000);
});
