import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CharacterSelect from './CharacterSelect';
import { CHARACTERS } from '@/types/game';

afterEach(() => vi.restoreAllMocks());

describe('CharacterSelect pagination', () => {
  it('shows five choices per page and makes the whole roster reachable with buttons', () => {
    render(<CharacterSelect onConfirm={vi.fn()} onBack={vi.fn()} gameMode="single" />);

    const characters = Object.values(CHARACTERS);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(5);
    characters.slice(0, 5).forEach((character) => {
      expect(screen.getByRole('heading', { name: character.nameKo })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(characters.length - 5);
    characters.slice(5).forEach((character) => {
      expect(screen.getByRole('heading', { name: character.nameKo })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: characters[0].nameKo })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it.each(['single', 'multi'] as const)('preserves selections across pages and player changes in %s mode', (gameMode) => {
    const onConfirm = vi.fn();
    render(<CharacterSelect onConfirm={onConfirm} onBack={vi.fn()} gameMode={gameMode} />);

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('heading', { name: CHARACTERS.hacker.nameKo }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByRole('heading', { level: 2, name: CHARACTERS.hacker.nameKo })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: gameMode === 'single' ? 'AI 캐릭터 선택' : 'P1 선택 완료' }));

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    if (gameMode === 'multi') {
      fireEvent.click(screen.getByRole('button', { name: 'P1 다시 선택' }));
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'P1 선택 완료' }));
    }
    fireEvent.click(screen.getByRole('heading', { name: CHARACTERS.archer.nameKo }));
    fireEvent.click(screen.getByRole('button', { name: gameMode === 'single' ? 'AI 난이도 선택' : '맵 선택' }));

    expect(onConfirm).toHaveBeenCalledWith(CHARACTERS.hacker, CHARACTERS.archer);
  });

  it('opens the page containing a randomly selected character', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    render(<CharacterSelect onConfirm={vi.fn()} onBack={vi.fn()} gameMode="single" />);

    fireEvent.click(screen.getByRole('button', { name: '무작위 선택' }));

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: CHARACTERS.hacker.nameKo })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI 캐릭터 선택' })).toBeEnabled();
  });
});

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
    fireEvent.click(screen.getByRole('button', { name: 'AI 난이도 선택' }));

    expect(onConfirm).toHaveBeenCalledWith(CHARACTERS.gladiator, CHARACTERS.archer);
  });
});
