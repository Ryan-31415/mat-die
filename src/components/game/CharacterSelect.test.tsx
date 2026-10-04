import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CharacterSelect from './CharacterSelect';
import { CHARACTERS } from '@/types/game';

describe('CharacterSelect in single-player mode', () => {
  it('lets the player choose the AI character before starting', () => {
    const onConfirm = vi.fn();

    render(
      <CharacterSelect
        onConfirm={onConfirm}
        onBack={vi.fn()}
        gameMode="single"
      />,
    );

    fireEvent.click(screen.getByText(CHARACTERS.gladiator.nameKo));
    fireEvent.click(screen.getByRole('button', { name: 'AI 캐릭터 선택' }));

    expect(screen.getByText('대전할 AI 캐릭터를 선택하세요')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(CHARACTERS.archer.nameKo));
    fireEvent.click(screen.getByRole('button', { name: '맵 선택' }));

    expect(onConfirm).toHaveBeenCalledWith(CHARACTERS.gladiator, CHARACTERS.archer);
  });
});
