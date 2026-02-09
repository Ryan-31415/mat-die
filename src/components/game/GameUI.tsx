import { Player } from '@/types/game';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Pause, Home } from 'lucide-react';

interface GameUIProps {
  players: [Player, Player];
  currentRound: number;
  maxRounds: number;
  scores: [number, number];
  timeRemaining: number;
  isPaused: boolean;
  onPause: () => void;
  onReturnToMenu: () => void;
  isOvertime?: boolean;
}

const GameUI = ({
  players,
  currentRound,
  maxRounds,
  scores,
  timeRemaining,
  isPaused,
  onPause,
  onReturnToMenu,
  isOvertime,
}: GameUIProps) => {
  const formatTime = (seconds: number) => {
    if (seconds >= 999) return '∞';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-4xl mb-4 space-y-2 min-h-fit">
      {/* Top bar: Round info and timer */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={onReturnToMenu}>
          <Home className="h-5 w-5" />
        </Button>

        <div className="text-center">
          <div className="text-lg font-bold">
            {isOvertime ? (
              <span className="text-destructive animate-pulse">연장전</span>
            ) : (
              `라운드 ${currentRound} / ${maxRounds}`
            )}
          </div>
          <div className="text-2xl font-mono font-bold text-primary">
            {formatTime(timeRemaining)}
          </div>
        </div>

        <Button variant="ghost" size="icon" onClick={onPause}>
          <Pause className="h-5 w-5" />
        </Button>
      </div>

      {/* Score display */}
      <div className="flex justify-center gap-4 text-xl font-bold">
        <span className="text-primary">P1: {scores[0]}</span>
        <span className="text-muted-foreground">-</span>
        <span className="text-destructive">P2: {scores[1]}</span>
      </div>

      {/* Player stats */}
      <div className="flex justify-between gap-4">
        {/* Player 1 */}
        <PlayerStats player={players[0]} isPlayer1 />

        {/* Player 2 */}
        <PlayerStats player={players[1]} isPlayer1={false} />
      </div>
    </div>
  );
};

interface PlayerStatsProps {
  player: Player;
  isPlayer1: boolean;
}

const PlayerStats = ({ player, isPlayer1 }: PlayerStatsProps) => {
  const character = player.character;
  if (!character) return null;

  const healthPercent = (player.health / player.maxHealth) * 100;
  const manaPercent = (player.mana / player.maxMana) * 100;
  const skillCooldownPercent = character.skill.cooldown > 0
    ? ((character.skill.cooldown - player.skillCooldownRemaining) / character.skill.cooldown) * 100
    : 100;
  const attackCooldownPercent = ((character.attackCooldown - player.attackCooldownRemaining) / character.attackCooldown) * 100;

  return (
    <div className={`flex-1 p-3 rounded-lg border ${isPlayer1 ? 'border-primary/50' : 'border-destructive/50'}`}>
      <div className="flex items-center justify-between mb-2">
        <span
          className={`font-bold ${isPlayer1 ? 'text-primary' : 'text-destructive'}`}
        >
          P{player.id} - {character.nameKo}
        </span>
        <div
          className="w-6 h-6 rounded"
          style={{ backgroundColor: character.color }}
        />
      </div>

      {/* Health bar */}
      <div className="space-y-1 mb-2">
        <div className="flex justify-between text-xs">
          <span>체력</span>
          <span>{Math.ceil(player.health)} / {player.maxHealth}</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-red-500 transition-all duration-200"
            style={{ width: `${healthPercent}%` }}
          />
        </div>
      </div>

      {/* Mana bar */}
      <div className="space-y-1 mb-2">
        <div className="flex justify-between text-xs">
          <span>마나</span>
          <span>{Math.ceil(player.mana)} / {player.maxMana}</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-200"
            style={{ width: `${manaPercent}%` }}
          />
        </div>
      </div>

      {/* Skill cooldown */}
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="text-xs mb-1">스킬 ({character.skill.manaCost}%)</div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${player.skillCooldownRemaining > 0 ? 'bg-muted-foreground' : 'bg-violet-500'
                }`}
              style={{ width: `${skillCooldownPercent}%` }}
            />
          </div>
        </div>

        <div className="flex-1">
          <div className="text-xs mb-1">궁극기 (100%)</div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${player.mana >= 100 ? 'bg-amber-500' : 'bg-amber-500/50'
                }`}
              style={{ width: `${manaPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Status effects display */}
      {(player.buffDuration > 0 || player.isPoisoned || player.isSlowed || player.isStunned || player.isInvisible || player.isFrozen || player.freezeGauge > 0 || player.mageUltimateDuration > 0 || player.isBurning || player.regenDuration > 0 || player.invulnerableDuration > 0 || player.poisonArrowsRemaining > 0 || player.dodgesRemaining > 0 || player.isMarked || player.hunterFocusedDuration > 0 || player.isSilenced || player.isHacked) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {player.isSilenced && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded">
              침묵 {(player.silenceDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.isHacked && (
            <span className="text-xs px-1.5 py-0.5 bg-lime-500/20 text-lime-500 rounded animate-pulse">
              해킹 {(player.hackedDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.isFrozen && (
            <span className="text-xs px-1.5 py-0.5 bg-sky-500/20 text-sky-500 rounded animate-pulse">
              빙결 {(player.frozenDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.freezeGauge > 0 && !player.isFrozen && (
            <span className="text-xs px-1.5 py-0.5 bg-sky-500/20 text-sky-400 rounded">
              결빙 {player.freezeGauge} / 5
            </span>
          )}
          {player.buffDuration > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-500 rounded">
              버프 {(player.buffDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.isPoisoned && (
            <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-500 rounded">
              독 {(player.poisonDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.isSlowed && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-500 rounded">
              둔화 {(player.slowDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.isStunned && (
            <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 rounded">
              기절 {(player.stunDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.isInvisible && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-500 rounded">
              은신 {(player.invisibleDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.regenDuration > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-pink-400/20 text-pink-400 rounded animate-pulse">
              재생 {(player.regenDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.isBurning && (
            <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-500 rounded">
              화상 {(player.burnDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.mageUltimateDuration > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-500 rounded">
              각성 {(player.mageUltimateDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.isMarked && (
            <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-500 rounded">
              표식 {(player.markDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.hunterFocusedDuration > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-500 rounded">
              집중 {(player.hunterFocusedDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.dodgesRemaining > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-500/20 text-gray-500 rounded">
              회피 x {player.dodgesRemaining}
            </span>
          )}
          {player.invulnerableDuration > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-black-500/20 text-black-500 rounded">
              무적 {(player.invulnerableDuration / 1000).toFixed(1)}s
            </span>
          )}
          {player.poisonArrowsRemaining > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-500 rounded">
              독화살 x {player.poisonArrowsRemaining}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default GameUI;
