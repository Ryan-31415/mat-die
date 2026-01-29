import { Player, Character, PLAYER_SIZE } from '@/types/game';

interface PlayerRendererProps {
  player: Player;
  character: Character;
}

const PlayerRenderer = ({ player, character }: PlayerRendererProps) => {
  const statusEffects = [];
  if (player.isPoisoned) statusEffects.push('☠️');
  if (player.isSlowed) statusEffects.push('🐌');
  if (player.isStunned) statusEffects.push('💫');
  if (player.isShielding) statusEffects.push('🛡️');
  if (player.isDashing) statusEffects.push('💨');
  if (player.buffDuration > 0) statusEffects.push('⬆️');
  if (player.rootDuration > 0) statusEffects.push('🕸️');
  if (player.regenDuration > 0) statusEffects.push('♥️');
  if (player.poisonArrowsRemaining > 0) statusEffects.push(`🟢x${player.poisonArrowsRemaining}`);

  const now = Date.now();
  const trailPositions = player.trailPositions || [];

  return (
    <>
      {/* Reaper ultimate trail effects */}
      {player.isFlying && character.id === 'reaper' && trailPositions.length > 0 && (
        <>
          {trailPositions.map((trailPos, index) => {
            const age = now - trailPos.timestamp;
            const opacity = Math.max(0, 1 - age / 1000); // Fade out over 1 second
            const scale = 0.3 + (age / 1000) * 0.7; // Scale from 0.3 to 1.0
            
            return (
              <div
                key={`trail-${index}-${trailPos.timestamp}`}
                className="absolute pointer-events-none rounded-full"
                style={{
                  left: trailPos.x - PLAYER_SIZE / 2,
                  top: trailPos.y - PLAYER_SIZE / 2,
                  width: PLAYER_SIZE,
                  height: PLAYER_SIZE,
                  opacity: opacity * 0.4,
                  transform: `scale(${scale * 2.2})`,
                  background: 'radial-gradient(circle, #475569 0%, #0f172a 100%)',
                  border: '2px solid #64748b',
                  boxShadow: `0 0 ${40 * scale}px #4b5563`,
                  zIndex: 1,
                }}
              />
            );
          })}
        </>
      )}
      <div
        className="absolute transition-transform"
      style={{
        left: player.x,
        top: player.y,
        width: PLAYER_SIZE,
        height: PLAYER_SIZE,
        opacity: player.isInvisible ? 0.3 : (player.isFlying ? 0.6 : 1),
        transform: `scaleX(${player.facingRight ? 1 : -1})`,
      }}
    >
      {/* Character body */}
      <div
        className={`w-full h-full border-2 border-foreground/50 ${player.isAttacking || player.isUsingSkill || player.isUsingUltimate
          ? 'animate-pulse'
          : ''
          } ${player.isStunned ? 'opacity-50' : ''} ${player.isFlying ? 'rounded-full' : 'rounded-lg'}`}
        style={{
          backgroundColor: player.isFlying ? '#1e293b' : character.color,
          background: player.isFlying ? 'radial-gradient(circle, #475569 0%, #0f172a 100%)' : character.color,
          boxShadow: (player.buffDuration > 0 || player.isFlying)
            ? `0 0 ${player.isFlying ? '40px' : '20px'} ${player.isFlying ? '#4b5563' : character.color}`
            : undefined,
          transform: (player.isFlying && character.id === 'reaper') ? 'scale(2.2)' : undefined,
          borderColor: player.isFlying ? '#64748b' : undefined,
        }}
      >
        {/* Face */}
        {!player.isFlying && (
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
        )}

        {/* Shield effect for gladiator */}
        {player.isShielding && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-16 bg-amber-500/80 rounded-lg border-2 border-amber-300 shadow-md"
            style={{
              left: PLAYER_SIZE - 10, // Front of player (assuming facing right is default scale)
              zIndex: 5
            }}
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
        className={`absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold px-2 py-0.5 rounded ${player.id === 1
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
            <span key={i} className="whitespace-nowrap">{effect}</span>
          ))}
        </div>
      )}

      {/* Attack animation indicator */}
      {player.isAttacking && (
        <>
          {character.id === 'gladiator' ? (
            <div
              className="absolute bg-gradient-to-r from-transparent via-gray-600 to-transparent shadow-[0_0_15px_rgba(75,85,99,0.9)] animate-sword-swing"
              style={{
                width: '65px',
                height: '7px',
                top: '50%',
                left: '80%',
                zIndex: 20,
                transformOrigin: 'left center',
                marginTop: '-3.5px',
                marginLeft: '0px'
              }}
            />
          ) : character.id === 'ninja' ? (
            <div
              className="absolute bg-gradient-to-r from-transparent via-gray-700 to-transparent shadow-[0_0_15px_rgba(55,65,81,0.95)] animate-katana-slash"
              style={{
                width: '65px',
                height: '3px',
                top: '50%',
                left: '80%',
                zIndex: 20,
                transformOrigin: 'left center',
                marginTop: '-1.5px',
                marginLeft: '0px'
              }}
            />
          ) : character.id === 'hunter' ? (
            <div
              className="absolute bg-amber-400/80 blur-[2px] rounded-full animate-ping"
              style={{
                width: '16px',
                height: '16px',
                top: '40%',
                left: '95%',
                zIndex: 30
              }}
            />
          ) : character.id === 'reaper' ? (
            <div
              className={`absolute ${player.isAttacking ? 'animate-scythe-swing' : ''}`}
              style={{
                top: '50%',
                left: '20%',
                zIndex: 20,
                transformOrigin: 'left center',
                opacity: player.isAttacking ? 1 : 0,
                marginTop: '-45px',
              }}
            >
              <svg width="120" height="90" viewBox="0 0 120 90">
                {/* Long handle (long straight line) */}
                <path d="M10,85 L25,5" stroke="#2d221c" strokeWidth="4" strokeLinecap="round" />
                {/* Connection point (where blade meets handle) - thicker bit */}
                <rect x="22" y="2" width="6" height="12" rx="2" fill="#1a1a1a" stroke="#000" strokeWidth="1" transform="rotate(-5 25 2)" />
                {/* Scythe blade - specifically matching the image curved sharp look */}
                <path
                  d="M25,5 C55,-5 90,5 110,35 C95,20 60,10 25,5 Z"
                  fill="#334155"
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
                {/* Notches for a worn/used look matching image */}
                <path d="M75,12 L70,14 L73,10 Z" fill="#0f172a" />
                <path d="M90,20 L85,22 L88,18 Z" fill="#0f172a" />
              </svg>
            </div>
          ) : (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-8 h-2 bg-foreground/50 rounded"
              style={{
                left: player.facingRight ? PLAYER_SIZE : -8,
                animation: 'pulse 0.2s ease-out',
              }}
            />
          )}
        </>
      )}
    </div>
    </>
  );
};

export default PlayerRenderer;