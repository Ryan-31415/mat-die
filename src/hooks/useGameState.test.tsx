import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGameState } from './useGameState';

const StrictModeWrapper = ({ children }: PropsWithChildren) => (
  <StrictMode>{children}</StrictMode>
);

describe('useGameState endRound', () => {
  it('keeps the score accurate at each round and when the match ends', () => {
    const { result } = renderHook(() => useGameState(), {
      wrapper: StrictModeWrapper,
    });

    act(() => result.current.endRound(1));

    expect(result.current.scores).toEqual([1, 0]);
    expect(result.current.roundsCompleted).toBe(1);
    expect(result.current.screen).toBe('menu');

    act(() => result.current.endRound(1));

    expect(result.current.scores).toEqual([2, 0]);
    expect(result.current.matchWinner).toBe(1);
    expect(result.current.screen).toBe('result');
  });

  it('includes the overtime winner in the final score', () => {
    const { result } = renderHook(() => useGameState());

    act(() => {
      result.current.setSettings(settings => ({ ...settings, maxRounds: 1 }));
    });
    act(() => result.current.endRound('draw'));

    expect(result.current.isOvertime).toBe(true);
    expect(result.current.scores).toEqual([0, 0]);

    act(() => result.current.endRound(2));

    expect(result.current.scores).toEqual([0, 1]);
    expect(result.current.matchWinner).toBe(2);
    expect(result.current.screen).toBe('result');
  });
});
