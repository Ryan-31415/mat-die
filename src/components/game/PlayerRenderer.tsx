import { Player, Character, PLAYER_SIZE } from '@/types/game';
import type { BasicAttackVisual } from '@/types/combatVisual';
import WeaponVisual from './weapons/WeaponVisual';
import { weaponPose } from './weapons/weaponPose';

interface PlayerRendererProps {
  player: Player;
  character: Character;
  attack?: BasicAttackVisual;
  visualTime?: number;
}

const PlayerRenderer = ({ player, character, attack, visualTime = 0 }: PlayerRendererProps) => {
  const statusEffects = [];
  if (player.isPoisoned) statusEffects.push('☠️');
  if (player.isSlowed) statusEffects.push('🐌');
  if (player.isStunned) statusEffects.push('💫');
  if (player.isShielding) statusEffects.push('🛡️');
  if (player.isSilenced) statusEffects.push('🔇');
  if (player.isHacked) statusEffects.push('💻');
  if (player.dodgesRemaining > 0) statusEffects.push(`💨x${player.dodgesRemaining}`);
  if (player.buffDuration > 0) statusEffects.push('⬆️');
  if (player.rootDuration > 0) statusEffects.push('🕸️');
  if (player.regenDuration > 0) statusEffects.push('♥️');
  if (player.poisonArrowsRemaining > 0) statusEffects.push(`🟢x${player.poisonArrowsRemaining}`);
  if (player.invisibleDuration > 0) statusEffects.push('👻');
  if (player.freezeGauge > 0 && !player.isFrozen) statusEffects.push(`❄️x${player.freezeGauge}`);
  if (player.isFrozen) statusEffects.push('🧊');
  if (player.isBurning) statusEffects.push('🔥');
  if (player.mageUltimateDuration > 0) statusEffects.push('🌟');
  if (player.napalmDuration > 0) statusEffects.push('🚀');
  if (character.id === 'archer' && player.archerBurstRemaining > 0) statusEffects.push(`🏹x${player.archerBurstRemaining}`);
  if (player.isMarked) statusEffects.push('🎯');
  if (player.hunterFocusedDuration > 0) statusEffects.push('🔭');

  const pose = weaponPose(character.id, attack ? visualTime - attack.startedAt : null, player);
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

      {/* Mage ultimate fire particles */}
      {player.mageUltimateDuration > 0 && character.id === 'mage' && (
        <>
          {[...Array(8)].map((_, i) => {
            const angle = (i / 8) * Math.PI * 2 + (now / 300);
            const radius = 30 + Math.sin(now / 200 + i) * 8;
            const offsetX = Math.cos(angle) * radius;
            const offsetY = Math.sin(angle) * radius;
            return (
              <div
                key={`fire-particle-${i}`}
                className="absolute rounded-full"
                style={{
                  left: player.x + PLAYER_SIZE / 2 + offsetX - 4,
                  top: player.y + PLAYER_SIZE / 2 + offsetY - 4,
                  width: 8 + Math.sin(now / 100 + i) * 3,
                  height: 8 + Math.sin(now / 100 + i) * 3,
                  background: `radial-gradient(circle, rgba(255, ${150 + Math.sin(now / 100 + i) * 50}, 0, 1), rgba(255, 50, 0, 0.6))`,
                  boxShadow: '0 0 8px rgba(255, 100, 0, 0.8)',
                  zIndex: 5,
                }}
              />
            );
          })}
        </>
      )}

      <div
        className="absolute"
        style={{
          left: player.x,
          top: player.y,
          width: PLAYER_SIZE,
          height: PLAYER_SIZE,
          opacity: player.isClone ? 0.4 : (player.isInvisible ? 0.3 : (player.isFlying ? 0.6 : 1)),
        }}
      >
        {/* Mini Health Bar for Clones */}
        {player.isClone && (
          <div style={{ zIndex: 8 }} className="absolute -top-8 left-0 right-0 h-1.5 bg-muted rounded-full overflow-hidden border border-background">
            <div
              className="h-full bg-red-500 transition-all duration-200"
              style={{ width: `${(player.health / player.maxHealth) * 100}%` }}
            />
          </div>
        )}
        {/* Character body */}
        <div
          className={`w-full h-full border-2 border-foreground/50 ${player.isUsingSkill || player.isChargingSkill || player.isUsingUltimate
            ? 'animate-pulse'
            : ''
            } ${player.isStunned ? 'opacity-50' : ''} ${player.isFlying ? 'rounded-full' : 'rounded-lg'}`}
          style={{
            backgroundColor: player.isFlying ? '#1e293b' : character.color,
            background: player.isFlying ? 'radial-gradient(circle, #475569 0%, #0f172a 100%)' : character.color,
            boxShadow: (player.buffDuration > 0 || player.isFlying)
              ? `0 0 ${player.isFlying ? '40px' : '20px'} ${player.isFlying ? '#4b5563' : character.color}`
              : undefined,
            transform: (player.isFlying && character.id === 'reaper') ? 'scale(2.2)' : `scaleX(${player.facingRight ? 1 : -1}) rotate(${pose.bodyAngle}deg)`,
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
              }}
            >
              {/* Eyes */}
              <div className="w-2 h-2 bg-background rounded-full" />
              <div className="w-2 h-2 bg-background rounded-full" />
            </div>
          )}

          {/* Dash trail for ninja */}
          {player.isDashing && (
            <>
              {[34, 20, 8].map((offset, index) => (
                <div
                  key={`ninja-dash-afterimage-${offset}`}
                  className="absolute inset-0 rounded-lg pointer-events-none"
                  style={{
                    background: `linear-gradient(90deg, ${character.color} 0%, ${character.color}cc 55%, ${character.color}00 100%)`,
                    border: `1px solid ${character.color}99`,
                    boxShadow: `0 0 ${12 - index * 2}px ${character.color}88`,
                    opacity: 0.12 + index * 0.07,
                    filter: `blur(${2 - index * 0.5}px)`,
                    transform: `translateX(-${offset}px) scaleX(${1.08 - index * 0.03})`,
                  }}
                />
              ))}
            </>
          )}
        </div>

        {/* Shield occupies its own front layer; labels stay outside direction transforms. */}
        {player.isShielding && (
          <div aria-hidden="true" className="absolute pointer-events-none w-4 h-16 bg-amber-500/80 rounded-lg border-2 border-amber-300 shadow-md"
            style={{ left: player.facingRight ? PLAYER_SIZE - 10 : -6, top: PLAYER_SIZE / 2, transform: 'translateY(-50%)', zIndex: 5 }} />
        )}

        {/* Scientist Charge Bar */}
        {character.id === 'scientist' && player.isChargingSkill && player.skillChargeStartTime && (
          <div style={{ zIndex: 8 }} className="absolute -top-10 left-1/2 -translate-x-1/2 w-12 h-2 bg-gray-700/80 rounded-full overflow-hidden border border-white/30">
            {(() => {
              const chargeTime = now - player.skillChargeStartTime;
              const chargeRatio = Math.min(1, chargeTime / 1750);
              const overchargeRatio = Math.max(0, (chargeTime - 1750) / 2000);

              // Color: Yellow -> Red as it overcharges
              let barColor = '#fbbf24'; // Amber-400
              if (chargeRatio >= 1) {
                // Flash red when near explosion
                if (overchargeRatio > 0.85 && Math.floor(now / 100) % 2 === 0) {
                  barColor = '#ef4444'; // Red-500
                } else if (overchargeRatio > 0.4) {
                  // Interpolate from Yellow to Red
                  barColor = `rgb(${251 + (239 - 251) * overchargeRatio}, ${191 + (68 - 191) * overchargeRatio}, ${36 + (68 - 36) * overchargeRatio})`;
                }
                else if (overchargeRatio > 0) {
                  // Interpolate from blue to yellow  
                  barColor = `rgb(${59 + (251 - 59) * overchargeRatio}, ${130 + (191 - 130) * overchargeRatio}, ${246 + (36 - 246) * overchargeRatio})`;
                } else {
                  barColor = '#3b82f6'; // Blue
                }
              } else {
                // Charging phase
                barColor = '#22c55e'; // Green
              }

              return (
                <div
                  className="h-full transition-all duration-75"
                  style={{
                    width: `${Math.min(100, (chargeTime / 1750) * 100)}%`,
                    backgroundColor: barColor,
                  }}
                />
              );
            })()}
          </div>
        )}

        {/* Player indicator */}
        {!player.isClone && (
          <div
            className={`absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold px-2 py-0.5 rounded ${player.id === 1
              ? 'bg-primary text-primary-foreground'
              : 'bg-destructive text-destructive-foreground'
              }`}
            style={{ zIndex: 8 }}
          >
            P{player.id}
          </div>
        )}

        {/* Status effects */}
        {statusEffects.length > 0 && (
          <div
            className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex gap-0.5 text-xs"
            style={{ zIndex: 8 }}
          >
            {statusEffects.map((effect, i) => (
              <span key={i} className="whitespace-nowrap">{effect}</span>
            ))}
          </div>
        )}
      </div>
      <WeaponVisual player={player} attack={attack} visualTime={visualTime} />
    </>
  );
};

export default PlayerRenderer;
