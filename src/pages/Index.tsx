import { useState } from 'react';
import MainMenu from '@/components/game/MainMenu';
import CharacterSelect from '@/components/game/CharacterSelect';
import MapSelect from '@/components/game/MapSelect';
import GameArena from '@/components/game/GameArena';
import ResultScreen from '@/components/game/ResultScreen';
import SettingsModal from '@/components/game/SettingsModal';
import ControlsModal from '@/components/game/ControlsModal';
import { useGameState } from '@/hooks/useGameState';
import AIDifficultySelect from '@/components/game/AIDifficultySelect';

const Index = () => {
  const {
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
    startGame,
    confirmCharacterSelection,
    confirmAISettings,
    confirmMapSelection,
    goBackToCharacterSelect,
    goBackFromMapSelect,
    endRound,
    returnToMenu,
    rematch,
  } = useGameState();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);

  return (
    <>
      {screen === 'menu' && (
        <MainMenu
          onStartGame={startGame}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenControls={() => setControlsOpen(true)}
        />
      )}

      {screen === 'character-select' && (
        <CharacterSelect
          onConfirm={confirmCharacterSelection}
          onBack={returnToMenu}
          gameMode={gameMode}
          initialPlayer1={player1Character}
          initialPlayer2={player2Character}
        />
      )}

      {screen === 'ai-settings' && gameMode === 'single' && (
        <AIDifficultySelect settings={settings.ai} automaticTraits={aiSessionRef.current.difficulty?.automaticTraits}
          onChange={ai => setSettings({ ...settings, ai })} onBack={goBackToCharacterSelect} onConfirm={confirmAISettings} />
      )}

      {screen === 'map-select' && (
        <MapSelect
          onConfirm={confirmMapSelection}
          onBack={goBackFromMapSelect}
          backLabel={gameMode === 'single' ? 'AI 난이도 다시 선택' : '캐릭터 다시 선택'}
        />
      )}

      {screen === 'game' && player1Character && player2Character && (
        <GameArena
          aiSessionRef={aiSessionRef}
          player1Character={player1Character}
          player2Character={player2Character}
          settings={settings}
          scores={scores}
          onRoundEnd={endRound}
          onReturnToMenu={returnToMenu}
          gameMode={gameMode}
          isOvertime={isOvertime}
          roundsCompleted={roundsCompleted}
          mapId={selectedMap}
        />
      )}

      {screen === 'result' && matchWinner && player1Character && player2Character && (
        <ResultScreen
          winner={matchWinner}
          player1Character={player1Character}
          player2Character={player2Character}
          scores={scores}
          onRematch={rematch}
          onReturnToMenu={returnToMenu}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={setSettings}
      />

      <ControlsModal open={controlsOpen} onOpenChange={setControlsOpen} />
    </>
  );
};

export default Index;
