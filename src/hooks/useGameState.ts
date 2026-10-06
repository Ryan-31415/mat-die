import { useState, useCallback, useRef, useEffect } from 'react';
import { createAILearningSession } from './ai/state';
import { createDifficultySession } from './ai/difficulty';
import { loadAISettings, saveAISettings } from '@/types/ai';
import {
  GameScreen,
  GameSettings,
  DEFAULT_SETTINGS,
  Character,
} from '@/types/game';
import { MapId } from '@/types/map';

export const useGameState = () => {
  const aiSessionRef = useRef(createAILearningSession());
  const [screen, setScreen] = useState<GameScreen>('menu');
  const [settings, setSettings] = useState<GameSettings>(() => ({ ...DEFAULT_SETTINGS, ai: loadAISettings() }));
  useEffect(() => { saveAISettings(settings.ai); }, [settings.ai]);
  const [player1Character, setPlayer1Character] = useState<Character | null>(null);
  const [player2Character, setPlayer2Character] = useState<Character | null>(null);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [matchWinner, setMatchWinner] = useState<1 | 2 | 'draw' | null>(null);
  const [gameMode, setGameMode] = useState<'single' | 'multi'>('multi');
  const [isOvertime, setIsOvertime] = useState(false);
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  const [selectedMap, setSelectedMap] = useState<MapId>('default');

  const goToScreen = useCallback((newScreen: GameScreen) => {
    setScreen(newScreen);
  }, []);

  const startGame = useCallback((mode: 'single' | 'multi') => {
    aiSessionRef.current = { ...createAILearningSession(), ...(mode === 'single' ? { difficulty: createDifficultySession() } : {}) };
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
    goToScreen(gameMode === 'single' ? 'ai-settings' : 'map-select');
  }, [goToScreen, gameMode]);

  const confirmAISettings = useCallback(() => { goToScreen('map-select'); }, [goToScreen]);
  const goBackFromMapSelect = useCallback(() => {
    goToScreen(gameMode === 'single' ? 'ai-settings' : 'character-select');
  }, [gameMode, goToScreen]);

  const confirmMapSelection = useCallback((mapId: MapId) => {
    setSelectedMap(mapId);
    goToScreen('game');
  }, [goToScreen]);

  const goBackToCharacterSelect = useCallback(() => {
    goToScreen('character-select');
  }, [goToScreen]);

  const endRound = useCallback(
    (winner: 1 | 2 | 'draw') => {
      const newScores: [number, number] = [...scores];
      if (winner !== 'draw') {
        newScores[winner - 1]++;
      }

      setScores(newScores);

      if (isOvertime) {
        setMatchWinner(winner);
        goToScreen('result');
        return;
      }

      const newRoundsCompleted = roundsCompleted + 1;
      setRoundsCompleted(newRoundsCompleted);

      const winsNeeded = Math.ceil(settings.maxRounds / 2);

      if (winner !== 'draw' && newScores[winner - 1] >= winsNeeded) {
        setMatchWinner(winner);
        goToScreen('result');
      } else if (newRoundsCompleted >= settings.maxRounds) {
        if (newScores[0] === newScores[1]) {
          setIsOvertime(true);
        } else {
          setMatchWinner(newScores[0] > newScores[1] ? 1 : 2);
          goToScreen('result');
        }
      }
    },
    [scores, settings.maxRounds, roundsCompleted, isOvertime, goToScreen]
  );

  const returnToMenu = useCallback(() => {
    aiSessionRef.current = createAILearningSession();
    setPlayer1Character(null);
    setPlayer2Character(null);
    setScores([0, 0]);
    setMatchWinner(null);
    goToScreen('menu');
  }, [goToScreen]);

  const rematch = useCallback(() => {
    setScores([0, 0]);
    setMatchWinner(null);
    setIsOvertime(false);
    setRoundsCompleted(0);
    goToScreen('game');
  }, [goToScreen]);

  return {
    aiSessionRef,
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
    selectedMap,
    goToScreen,
    startGame,
    selectCharacter,
    confirmCharacterSelection,
    confirmAISettings,
    confirmMapSelection,
    goBackToCharacterSelect,
    goBackFromMapSelect,
    endRound,
    returnToMenu,
    rematch,
  };
};
