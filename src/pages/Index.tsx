import { useState } from 'react';
import MainMenu from '@/components/game/MainMenu';
import CharacterSelect from '@/components/game/CharacterSelect';
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

      {screen === 'game' && (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-4">게임 화면</h2>
            <p className="text-muted-foreground mb-2">
              {player1Character?.nameKo} VS {player2Character?.nameKo}
            </p>
            <p className="text-muted-foreground">곧 구현됩니다!</p>
            <button
              onClick={returnToMenu}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
            >
              메뉴로 돌아가기
            </button>
          </div>
        </div>
      )}

      {screen === 'result' && (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-4">결과 화면</h2>
            <p className="text-muted-foreground">곧 구현됩니다!</p>
            <button
              onClick={returnToMenu}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
            >
              메뉴로 돌아가기
            </button>
          </div>
        </div>
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
