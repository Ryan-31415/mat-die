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
  const [matchWinner, setMatchWinner] = useState<1 | 2 | 'draw' | null>(null);
  const [gameMode, setGameMode] = useState<'single' | 'multi'>('multi');
  const [isOvertime, setIsOvertime] = useState(false);
  const [roundsCompleted, setRoundsCompleted] = useState(0);

  const goToScreen = useCallback((newScreen: GameScreen) => {
    setScreen(newScreen);
  }, []);

  const startGame = useCallback((mode: 'single' | 'multi') => {
    setGameMode(mode);
    setPlayer1Character(null);
    setPlayer2Character(null);
    setScores([0, 0]);
    setMatchWinner(null);
    setIsOvertime(false);
    setRoundsCompleted(0);
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
    setIsOvertime(false);
    setRoundsCompleted(0);
    goToScreen('game');
  }, [goToScreen]);

  const endRound = useCallback(
    (winner: 1 | 2 | 'draw') => {
      if (isOvertime) {
        setMatchWinner(winner === 'draw' ? 'draw' : winner);
        setTimeout(() => goToScreen('result'), 0);
        return;
      }

      setScores(prevScores => {
        const newScores: [number, number] = [...prevScores];
        if (winner !== 'draw') {
          newScores[winner - 1]++;
        }

        const newRoundsCompleted = roundsCompleted + 1;
        setRoundsCompleted(newRoundsCompleted);

        const winsNeeded = Math.ceil(settings.maxRounds / 2);

        if (winner !== 'draw' && newScores[winner - 1] >= winsNeeded) {
          setMatchWinner(winner);
          setTimeout(() => goToScreen('result'), 0);
        } else if (newRoundsCompleted >= settings.maxRounds) {
          if (newScores[0] === newScores[1]) {
            setIsOvertime(true);
          } else {
            setMatchWinner(newScores[0] > newScores[1] ? 1 : 2);
            setTimeout(() => goToScreen('result'), 0);
          }
        }

        return newScores;
      });
    },
    [settings.maxRounds, roundsCompleted, isOvertime, goToScreen]
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
    gameMode,
    isOvertime,
    roundsCompleted,
    goToScreen,
    startGame,
    selectCharacter,
    confirmCharacterSelection,
    endRound,
    returnToMenu,
    rematch,
  };
};
