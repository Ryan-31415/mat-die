import { act, renderHook } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CHARACTERS, type CharacterType } from '@/types/game';
import type { MapId } from '@/types/map';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from '../gameAI';

describe.skipIf(process.env.RUN_ROCKETEER_EVALUATION !== '1')('seeded Rocketeer operation and counter evaluation', () => {
  it('measures both sides across movement patterns and maps', async () => {
    const records: { role: string; enemy: CharacterType; map: MapId; seed: number; dealt: number; received: number; attempts: number; hits: number; winner: number | string | null }[] = [];
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random');
    try {
      for (const seed of [731, 1907]) for (const map of ['wasteland', 'jungle', 'volcano'] as MapId[])
        for (const enemy of ['gladiator', 'ninja', 'mage', 'rocketeer'] as const) for (const role of ['operation', 'counter']) {
          let rng = seed;
          random.mockImplementation(() => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; });
          vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
          const game = renderHook(() => useGameEngine(CHARACTERS[role === 'operation' ? enemy : 'rocketeer'],
            CHARACTERS[role === 'operation' ? 'rocketeer' : enemy], 20, vi.fn(), 'single', false, 1, map, undefined, true));
          const keys = { current: emptyAIKeys() };
          act(() => game.result.current.setKeysRef(keys));
          for (let tick = 0; tick < 1200 && game.result.current.gameState.isRoundActive; tick++) {
            const [human, ai] = game.result.current.gameState.players;
            const direction = ai.x >= human.x ? 1 : -1;
            keys.current.a = direction < 0; keys.current.d = direction > 0;
            keys.current.w = enemy === 'ninja' ? tick % 50 < 4 : map === 'volcano' && human.isGrounded && tick % 60 < 4;
            keys.current.f = true; keys.current.g = true; keys.current.h = true;
            act(() => { vi.advanceTimersByTime(17); });
          }
          const state = game.result.current.gameState, metrics = state.diagnostics!;
          expect(state.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.health))).toBe(true);
          records.push({ role, enemy, map, seed, dealt: metrics.directDamage[1], received: metrics.directDamage[0],
            attempts: metrics.attempts[1], hits: metrics.hits[1], winner: state.roundWinner });
          game.unmount(); vi.clearAllTimers();
          await new Promise<void>(resolve => vi.advanceTimersByTimeAsync(0).then(() => resolve()));
        }
    } finally { random.mockRestore(); vi.useRealTimers(); }
    for (const role of ['operation', 'counter']) {
      const games = records.filter(r => r.role === role);
      expect(games.reduce((sum, r) => sum + r.dealt, 0)).toBeGreaterThan(0);
      expect(games.filter(r => r.hits > 0).length).toBeGreaterThanOrEqual(games.length * 0.75);
    }
    if (process.env.ROCKETEER_EVAL_OUTPUT) writeFileSync(process.env.ROCKETEER_EVAL_OUTPUT, JSON.stringify(records, null, 2));
    console.log('Rocketeer seeded evaluation:', JSON.stringify(records));
  }, 120000);
});
