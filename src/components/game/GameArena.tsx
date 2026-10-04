import { useEffect, useRef, useState } from 'react';
import { Character, ARENA, PLAYER_SIZE } from '@/types/game';
import { MapId, MAPS } from '@/types/map';
import { useGameEngine } from '@/hooks/useGameEngine';
import { useKeyboard } from '@/hooks/useKeyboard';
import PlayerRenderer from './PlayerRenderer';
import ProjectileRenderer from './ProjectileRenderer';
import ExplosionRenderer from './ExplosionRenderer';
import HazardRenderer from './HazardRenderer';
import PlatformRenderer from './PlatformRenderer';
import GameUI from './GameUI';
import MapEffectsRenderer from './MapEffectsRenderer';

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
  mapId: MapId;
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
  mapId,
}: GameArenaProps) => {
  const map = MAPS[mapId];
  const { keysRef } = useKeyboard();
  const { gameState, setKeysRef, resetRound, togglePause } = useGameEngine(
    player1Character,
    player2Character,
    settings.roundTimeLimit,
    onRoundEnd,
    gameMode,
    isOvertime,
    roundsCompleted + 1,
    mapId
  );

  const [frozenRoundNumber, setFrozenRoundNumber] = useState(roundsCompleted + 1);
  const displayedRoundNumber = gameState.roundWinner
    ? frozenRoundNumber
    : roundsCompleted + 1;

  useEffect(() => {
    if (!gameState.roundWinner) {
      setFrozenRoundNumber(roundsCompleted + 1);
    }
  }, [roundsCompleted, gameState.roundWinner]);

  useEffect(() => {
    setKeysRef(keysRef);
  }, [setKeysRef, keysRef]);

  const prevRoundsRef = useRef(roundsCompleted);

  useEffect(() => {
    if (roundsCompleted !== prevRoundsRef.current || isOvertime) {
      prevRoundsRef.current = roundsCompleted;
      const winsNeeded = Math.ceil(settings.maxRounds / 2);
      const matchOver = scores[0] >= winsNeeded || scores[1] >= winsNeeded;

      if (!matchOver) {
        const timer = setTimeout(() => {
          resetRound();
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [roundsCompleted, scores, settings.maxRounds, resetRound, isOvertime]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <GameUI
        players={gameState.players}
        currentRound={displayedRoundNumber}
        maxRounds={settings.maxRounds}
        scores={scores}
        timeRemaining={gameState.roundTimeRemaining}
        isPaused={gameState.isPaused}
        onPause={togglePause}
        onReturnToMenu={onReturnToMenu}
        isOvertime={isOvertime}
      />

      {/* Arena */}
      <div
        className={`relative border-4 border-primary/50 rounded-lg overflow-hidden bg-gradient-to-b ${map.bgGradient}`}
        style={{
          width: ARENA.width,
          height: ARENA.height,
          ...map.arenaStyle,
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
          className="absolute left-0 right-0 h-1"
          style={{
            bottom: ARENA.padding,
            background: map.groundStyle?.background || undefined,
            boxShadow: map.groundStyle?.boxShadow as string || undefined,
            ...(map.hasLavaFloor ? {
              height: '20px',
              bottom: 0,
              background: map.groundStyle?.background,
              boxShadow: map.groundStyle?.boxShadow as string,
              animation: 'pulse 1s infinite',
            } : {}),
          }}
        />

        {/* Map environment effects */}
        <MapEffectsRenderer
          mapId={mapId}
          players={gameState.players}
          isRoundActive={gameState.isRoundActive}
          sandstormActive={gameState.sandstormActive}
          sandstormDirection={gameState.sandstormDirection}
          lightningStrikes={gameState.lightningStrikes}
          soulZones={gameState.soulZones}
          vineShields={gameState.vineShields}
          fallingLeaves={gameState.fallingLeaves}
        />

        {/* Platforms */}
        {gameState.platforms.map(platform => (
          <PlatformRenderer key={platform.id} platform={platform} mapId={mapId} />
        ))}

        {/* Hazard zones */}
        {gameState.hazardZones.map(zone => (
          <HazardRenderer key={zone.id} zone={zone} />
        ))}

        {/* Projectiles */}
        {gameState.projectiles.map(projectile => (
          <ProjectileRenderer key={projectile.id} projectile={projectile} />
        ))}

        {/* Players */}
        <PlayerRenderer player={gameState.players[0]} character={player1Character} />
        <PlayerRenderer player={gameState.players[1]} character={player2Character} />

        {/* Clones */}
        {gameState.clones.map((clone, index) => (
          <PlayerRenderer
            key={`clone-${clone.id}-${index}-${clone.x}`}
            player={clone}
            character={clone.character!}
          />
        ))}

        {/* Projectile impact effects */}
        {gameState.explosionEffects.map(effect => (
          <ExplosionRenderer key={effect.id} effect={effect} isPaused={gameState.isPaused} />
        ))}

        {/* Round winner overlay */}
        {gameState.roundWinner && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <div className="text-center animate-scale-in">
              <h2 className="text-4xl font-bold mb-2">
                {gameState.isOvertime ? '연장전 종료!' : `라운드 ${frozenRoundNumber} 종료!`}
              </h2>
              <p className="text-2xl text-primary font-bold">
                {gameState.roundWinner === 'draw' ? (gameState.isOvertime ? '경기 종료 (무승부)' : '무승부!') : `플레이어 ${gameState.roundWinner} 승리!`}
              </p>
              {gameState.roundWinner === 'draw' && !gameState.isOvertime && (
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
              <p className="text-muted-foreground">일시 정지 버튼을 다시 눌러 계속하기</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls reminder */}
      <div className="mt-4 flex gap-8 text-sm text-muted-foreground">
        <div>
          <span className="font-semibold text-primary">P1:</span> WASD 이동, F 공격, G 스킬, H 궁극기
        </div>
        {gameMode === 'multi' && (
          <div>
            <span className="font-semibold text-destructive">P2:</span> 화살표키 이동, Shift 평타, Enter 스킬, \ 궁극기
          </div>
        )}
        {gameMode === 'single' && (
          <div>
            <span className="font-semibold text-destructive">P2 (AI):</span> 컴퓨터 자동 조작
          </div>
        )}
      </div>
    </div>
  );
};

export default GameArena;
