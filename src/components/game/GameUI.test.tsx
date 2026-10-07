import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer, type Player } from '@/types/game';
import GameUI from './GameUI';

const effects: Array<[string, Partial<Player>]> = [
  ['침묵', { isSilenced: true, silenceDuration: 3000 }],
  ['해킹', { isHacked: true, hackedDuration: 3000 }],
  ['빙결', { isFrozen: true, frozenDuration: 3000 }],
  ['결빙', { freezeGauge: 3 }],
  ['버프', { buffDuration: 3000 }],
  ['독', { isPoisoned: true, poisonDuration: 3000 }],
  ['둔화', { isSlowed: true, slowDuration: 3000 }],
  ['기절', { isStunned: true, stunDuration: 3000 }],
  ['은신', { isInvisible: true, invisibleDuration: 3000 }],
  ['재생', { regenDuration: 3000 }],
  ['화상', { isBurning: true, burnDuration: 3000 }],
  ['각성', { mageUltimateDuration: 3000 }],
  ['표식', { isMarked: true, markDuration: 3000 }],
  ['집중', { hunterFocusedDuration: 3000 }],
  ['회피', { dodgesRemaining: 3 }],
  ['무적', { invulnerableDuration: 3000 }],
  ['독화살', { poisonArrowsRemaining: 3 }],
];

function ui(players: [Player, Player]) {
  return <GameUI players={players} currentRound={1} maxRounds={3} scores={[0, 0]}
    timeRemaining={60} isPaused={false} onPause={vi.fn()} onReturnToMenu={vi.fn()} />;
}

describe('status effect display', () => {
  it.each([1, 2] as const)('keeps the P%i effect region mounted through application and expiry', id => {
    const players: [Player, Player] = [
      createInitialPlayer(1, CHARACTERS.gladiator),
      createInitialPlayer(2, CHARACTERS.mage),
    ];
    const { rerender } = render(ui(players));
    const region = screen.getByRole('region', { name: `P${id} 상태 효과` });
    expect(region).toBeEmptyDOMElement();

    const active = [...players] as [Player, Player];
    active[id - 1] = { ...players[id - 1], ...Object.assign({}, ...effects.map(([, value]) => value)) };
    rerender(ui(active));
    expect(screen.getByRole('region', { name: `P${id} 상태 효과` })).toBe(region);
    // Frozen replaces the freeze gauge badge; all other effects remain available.
    expect(region.children).toHaveLength(effects.length - 1);
    expect(region).toHaveTextContent('독화살 x 3');

    rerender(ui(players));
    expect(screen.getByRole('region', { name: `P${id} 상태 효과` })).toBe(region);
    expect(region).toBeEmptyDOMElement();
  });

  it.each(effects)('continues to display the %s effect', (label, effect) => {
    const players: [Player, Player] = [
      { ...createInitialPlayer(1, CHARACTERS.gladiator), ...effect },
      createInitialPlayer(2, CHARACTERS.mage),
    ];
    render(ui(players));
    expect(screen.getByRole('region', { name: 'P1 상태 효과' })).toHaveTextContent(label);
  });
});
