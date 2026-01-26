import { useState } from 'react';
import MainMenu from '@/components/game/MainMenu';
import CharacterSelect from '@/components/game/CharacterSelect';
import GameArena from '@/components/game/GameArena';
import ResultScreen from '@/components/game/ResultScreen';
import SettingsModal from '@/components/game/SettingsModal';
import ControlsModal from '@/components/game/ControlsModal';
import { useGameState } from '@/hooks/useGameState';

const Index = () => {
  const {
    screen,
    settings,
    setSettings,
    player1Character,
    player2Character,
    scores,
    matchWinner,
    startGame,
    confirmCharacterSelection,
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
        />
      )}

      {screen === 'game' && player1Character && player2Character && (
        <GameArena
          player1Character={player1Character}
          player2Character={player2Character}
          settings={settings}
          scores={scores}
          onRoundEnd={endRound}
          onReturnToMenu={returnToMenu}
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
