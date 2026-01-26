import { useState, useCallback } from 'react';
import {
  GameScreen,
  GameSettings,
  DEFAULT_SETTINGS,
  Character,
} from '@/types/game';

export const useGameState = () => {
  const [screen, setScreen] = useState<GameScreen>('menu');
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [player1Character, setPlayer1Character] = useState<Character | null>(null);
  const [player2Character, setPlayer2Character] = useState<Character | null>(null);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [matchWinner, setMatchWinner] = useState<1 | 2 | null>(null);

  const goToScreen = useCallback((newScreen: GameScreen) => {
    setScreen(newScreen);
  }, []);

  const startGame = useCallback(() => {
    setPlayer1Character(null);
    setPlayer2Character(null);
    setScores([0, 0]);
    setMatchWinner(null);
    goToScreen('character-select');
  }, [goToScreen]);

  const selectCharacter = useCallback(
    (player: 1 | 2, character: Character) => {
      if (player === 1) {
        setPlayer1Character(character);
      } else {
        setPlayer2Character(character);
      }
    },
    []
  );

  const confirmCharacterSelection = useCallback((p1: Character, p2: Character) => {
    setPlayer1Character(p1);
    setPlayer2Character(p2);
    goToScreen('game');
  }, [goToScreen]);

  const endRound = useCallback(
    (winner: 1 | 2) => {
      const newScores: [number, number] = [...scores];
      newScores[winner - 1]++;
      setScores(newScores);

      const winsNeeded = Math.ceil(settings.maxRounds / 2);
      if (newScores[winner - 1] >= winsNeeded) {
        setMatchWinner(winner);
        goToScreen('result');
      }
    },
    [scores, settings.maxRounds, goToScreen]
  );

  const returnToMenu = useCallback(() => {
    setPlayer1Character(null);
    setPlayer2Character(null);
    setScores([0, 0]);
    setMatchWinner(null);
    goToScreen('menu');
  }, [goToScreen]);

  const rematch = useCallback(() => {
    setScores([0, 0]);
    setMatchWinner(null);
    goToScreen('game');
  }, [goToScreen]);

  return {
    screen,
    settings,
    setSettings,
    player1Character,
    player2Character,
    scores,
    matchWinner,
    goToScreen,
    startGame,
    selectCharacter,
    confirmCharacterSelection,
    endRound,
    returnToMenu,
    rematch,
  };
};
