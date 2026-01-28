import { useEffect, useRef } from 'react';
import { Character, ARENA, PLAYER_SIZE } from '@/types/game';
import { useGameEngine } from '@/hooks/useGameEngine';
import { useKeyboard } from '@/hooks/useKeyboard';
import PlayerRenderer from './PlayerRenderer';
import ProjectileRenderer from './ProjectileRenderer';
import HazardRenderer from './HazardRenderer';
import PlatformRenderer from './PlatformRenderer';
import GameUI from './GameUI';

interface GameArenaProps {
  player1Character: Character;
  player2Character: Character;
  settings: {
    maxRounds: number;
    roundTimeLimit: number;
    soundEnabled: boolean;
  };
  scores: [number, number];
  onRoundEnd: (winner: 1 | 2 | 'draw') => void;
  onReturnToMenu: () => void;
  gameMode: 'single' | 'multi';
  isOvertime: boolean;
  roundsCompleted: number;
}

const GameArena = ({
  player1Character,
  player2Character,
  settings,
  scores,
  onRoundEnd,
  onReturnToMenu,
  gameMode,
  isOvertime,
  roundsCompleted,
}: GameArenaProps) => {
  const { keysRef } = useKeyboard();
  const { gameState, setKeysRef, resetRound, togglePause } = useGameEngine(
    player1Character,
    player2Character,
    settings.roundTimeLimit,
    onRoundEnd,
    gameMode,
    isOvertime,
    roundsCompleted + 1
  );

  useEffect(() => {
    setKeysRef(keysRef);
  }, [setKeysRef, keysRef]);

  // Auto-reset round when scores change (meaning a round just ended)
  // We need to track previous scores to detect changes
  const prevScoresRef = useRef(scores);

  useEffect(() => {
    // Check if scores actually changed (a round just ended)
    if (scores[0] !== prevScoresRef.current[0] || scores[1] !== prevScoresRef.current[1]) {
      prevScoresRef.current = scores;

      // Check if match is not over yet
      const winsNeeded = Math.ceil(settings.maxRounds / 2);
      const matchOver = scores[0] >= winsNeeded || scores[1] >= winsNeeded;

      if (!matchOver) {
        // Delay the reset to show the round end overlay
        const timer = setTimeout(() => {
          resetRound();
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [scores, settings.maxRounds, resetRound]);

  const currentRound = scores[0] + scores[1] + 1;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      {/* Game UI */}
      <GameUI
        players={gameState.players}
        currentRound={currentRound}
        maxRounds={settings.maxRounds}
        scores={scores}
        timeRemaining={gameState.roundTimeRemaining}
        isPaused={gameState.isPaused}
        onPause={togglePause}
        onReturnToMenu={onReturnToMenu}
      />

      {/* Arena */}
      <div
        className="relative border-4 border-primary/50 rounded-lg overflow-hidden bg-gradient-to-b from-muted/50 to-muted"
        style={{
          width: ARENA.width,
          height: ARENA.height,
        }}
      >
        {/* Arena boundary markers */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute border-2 border-dashed border-primary/20"
            style={{
              left: ARENA.padding,
              top: ARENA.padding,
              right: ARENA.padding,
              bottom: ARENA.padding,
            }}
          />
        </div>

        {/* Ground line */}
        <div
          className="absolute left-0 right-0 h-1 bg-primary/30"
          style={{ bottom: ARENA.padding }}
        />

        {/* Platforms */}
        {gameState.platforms.map(platform => (
          <PlatformRenderer key={platform.id} platform={platform} />
        ))}

        {/* Hazard zones */}
        {gameState.hazardZones.map(zone => (
          <HazardRenderer key={zone.id} zone={zone} />
        ))}

        {/* Projectiles */}
        {gameState.projectiles.map(projectile => (
          <ProjectileRenderer key={projectile.id} projectile={projectile} />
        ))}

        {/* Attack hitboxes (Hidden) */}
        {/* {gameState.attackHitboxes.map(hitbox => (
          <div
            key={hitbox.id}
            className="absolute bg-primary/20 rounded"
            style={{
              left: hitbox.x,
              top: hitbox.y,
              width: hitbox.width,
              height: hitbox.height,
            }}
          />
        ))} */}

        {/* Players */}
        <PlayerRenderer
          player={gameState.players[0]}
          character={player1Character}
        />
        <PlayerRenderer
          player={gameState.players[1]}
          character={player2Character}
        />

        {/* Round winner overlay */}
        {gameState.roundWinner && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <div className="text-center animate-scale-in">
              <h2 className="text-4xl font-bold mb-2">
                라운드 {roundsCompleted + 1} 종료!
              </h2>
              <p className="text-2xl text-primary font-bold">
                {gameState.roundWinner === 'draw' ? '무승부!' : `플레이어 ${gameState.roundWinner} 승리!`}
              </p>
              {gameState.roundWinner === 'draw' && (
                <p className="text-xl text-destructive mt-2 animate-pulse">
                  곧 연장전이 시작됩니다!
                </p>
              )}
            </div>
          </div>
        )}

        {/* Pause overlay */}
        {gameState.isPaused && !gameState.roundWinner && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-4xl font-bold mb-4">일시 정지</h2>
              <p className="text-muted-foreground">
                아무 키나 눌러 계속하기
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Controls reminder */}
      <div className="mt-4 flex gap-8 text-sm text-muted-foreground">
        <div>
          <span className="font-semibold text-primary">P1:</span> A/D 이동, W 점프, Space 공격, Q 스킬, E 궁극기
        </div>
        {gameMode === 'multi' && (
          <div>
            <span className="font-semibold text-destructive">P2:</span> 화살표 이동, ↑ 점프, Enter 공격, Shift 스킬, / 궁극기
          </div>
        )}
        {gameMode === 'single' && (
          <div>
            <span className="font-semibold text-destructive">P2 (AI):</span> 컴퓨터 자동 조작
          </div>
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground/70">
        S/↓ 키를 누른 상태에서 플랫폼을 통과할 수 있습니다
      </div>
    </div>
  );
};

export default GameArena;
