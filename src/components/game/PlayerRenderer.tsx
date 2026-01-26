import { Player, Character, PLAYER_SIZE } from '@/types/game';

interface PlayerRendererProps {
  player: Player;
  character: Character;
}

const PlayerRenderer = ({ player, character }: PlayerRendererProps) => {
  const statusEffects = [];
  if (player.isPoisoned) statusEffects.push('🟢');
  if (player.isSlowed) statusEffects.push('🐌');
  if (player.isStunned) statusEffects.push('⚡');
  if (player.isShielding) statusEffects.push('🛡️');
  if (player.isDashing) statusEffects.push('💨');
  if (player.buffDuration > 0) statusEffects.push('⬆️');

  return (
    <div
      className="absolute transition-transform"
      style={{
        left: player.x,
        top: player.y,
        width: PLAYER_SIZE,
        height: PLAYER_SIZE,
        opacity: player.isInvisible ? 0.3 : 1,
        transform: `scaleX(${player.facingRight ? 1 : -1})`,
      }}
    >
      {/* Character body */}
      <div
        className={`w-full h-full rounded-lg border-2 border-foreground/50 ${
          player.isAttacking || player.isUsingSkill || player.isUsingUltimate 
            ? 'animate-pulse' 
            : ''
        } ${
          player.isStunned ? 'opacity-50' : ''
        }`}
        style={{ 
          backgroundColor: character.color,
          boxShadow: player.buffDuration > 0 
            ? `0 0 20px ${character.color}` 
            : undefined 
        }}
      >
        {/* Face */}
        <div 
          className="absolute flex gap-1 justify-center"
          style={{ 
            top: PLAYER_SIZE * 0.25, 
            left: 0, 
            right: 0,
            transform: `scaleX(${player.facingRight ? 1 : -1})`,
          }}
        >
          {/* Eyes */}
          <div className="w-2 h-2 bg-background rounded-full" />
          <div className="w-2 h-2 bg-background rounded-full" />
        </div>

        {/* Shield effect for gladiator */}
        {player.isShielding && (
          <div 
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-4 h-12 bg-amber-500/80 rounded-lg border-2 border-amber-300"
            style={{ transform: `scaleX(${player.facingRight ? 1 : -1}) translateY(-50%)` }}
          />
        )}

        {/* Dash trail for ninja */}
        {player.isDashing && (
          <div 
            className="absolute top-0 left-0 w-full h-full rounded-lg opacity-50"
            style={{ 
              backgroundColor: character.color,
              transform: `translateX(${player.facingRight ? -20 : 20}px)` 
            }}
          />
        )}
      </div>

      {/* Player indicator */}
      <div 
        className={`absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold px-2 py-0.5 rounded ${
          player.id === 1 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-destructive text-destructive-foreground'
        }`}
        style={{ transform: `scaleX(${player.facingRight ? 1 : -1}) translateX(${player.facingRight ? -50 : 50}%)` }}
      >
        P{player.id}
      </div>

      {/* Status effects */}
      {statusEffects.length > 0 && (
        <div 
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex gap-0.5 text-xs"
          style={{ transform: `scaleX(${player.facingRight ? 1 : -1}) translateX(${player.facingRight ? -50 : 50}%)` }}
        >
          {statusEffects.map((effect, i) => (
            <span key={i}>{effect}</span>
          ))}
        </div>
      )}

      {/* Attack animation indicator */}
      {player.isAttacking && (
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-8 h-2 bg-foreground/50 rounded"
          style={{ 
            left: player.facingRight ? PLAYER_SIZE : -8,
            animation: 'pulse 0.2s ease-out',
          }}
        />
      )}
    </div>
  );
};

export default PlayerRenderer;
