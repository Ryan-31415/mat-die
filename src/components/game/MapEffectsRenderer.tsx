import { Player, ARENA, PLAYER_SIZE } from '@/types/game';
import { MapId } from '@/types/map';

interface MapEffectsRendererProps {
  mapId: MapId;
  players: [Player, Player];
  isRoundActive: boolean;
  sandstormActive?: boolean;
  sandstormDirection?: 'left' | 'right';
  lightningStrikes?: Array<{
    id: string;
    x: number;
    targetPlayerId: 1 | 2;
    warningStart: number;
    struck: boolean;
  }>;
  soulZones?: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    createdAt: number;
    duration: number;
  }>;
  vineShields?: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    hp: number;
    destroyedAt?: number;
  }>;
  fallingLeaves?: Array<{
    id: string;
    x: number;
    y: number;
    rotation: number;
  }>;
  lavaPhase?: number;
}

const MapEffectsRenderer = ({
  mapId,
  players,
  isRoundActive,
  sandstormActive,
  sandstormDirection,
  lightningStrikes = [],
  soulZones = [],
  vineShields = [],
  fallingLeaves = [],
}: MapEffectsRendererProps) => {

  // Wasteland sandstorm
  if (mapId === 'wasteland') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Ambient dust - always present but stronger when active */}
        <div
          className="absolute inset-0 transition-opacity duration-1000"
          style={{
            backgroundColor: 'rgba(180, 140, 80, 0.05)',
            opacity: sandstormActive ? 1 : 0.4
          }}
        />

        {sandstormActive && (
          <>
            {/* Wind lines */}
            <div
              className="absolute inset-0 opacity-40"
              style={{
                background: `repeating-linear-gradient(${sandstormDirection === 'right' ? '90deg' : '270deg'}, 
                  transparent 0, transparent 40px, rgba(200, 170, 100, 0.2) 41px, transparent 44px)`,
                animation: `sandScroll${sandstormDirection === 'right' ? 'R' : 'L'} 1s linear infinite`,
              }}
            />

            {/* Intense sand cloud overlay */}
            <div
              className={`absolute inset-0 transition-all duration-1000 ${sandstormActive ? 'opacity-100' : 'opacity-0'}`}
              style={{
                background: `linear-gradient(${sandstormDirection === 'right' ? '90deg' : '270deg'}, 
                  rgba(180, 140, 60, 0.4), rgba(200, 160, 80, 0.2), rgba(180, 140, 60, 0.4))`,
                mixBlendMode: 'overlay',
              }}
            />

            {/* Sand particles - increased count */}
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={`sand-${i}`}
                className="absolute rounded-full"
                style={{
                  width: 2 + Math.random() * 4,
                  height: 1 + Math.random() * 2,
                  background: `rgba(${200 + Math.random() * 55}, ${160 + Math.random() * 40}, ${100 + Math.random() * 40}, ${0.5 + Math.random() * 0.5})`,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  boxShadow: '0 0 4px rgba(180, 140, 80, 0.4)',
                  animation: `sandParticle${sandstormDirection === 'right' ? 'R' : 'L'} ${0.3 + Math.random() * 0.7}s linear infinite`,
                  animationDelay: `${Math.random() * 1}s`,
                }}
              />
            ))}

            {/* Direction Indicator Icon */}
            <div className={`absolute top-24 ${sandstormDirection === 'right' ? 'left-8' : 'right-8'} animate-bounce bg-amber-600/60 p-2 rounded-full border border-amber-400/50 shadow-lg`}>
              <span className="text-2xl">{sandstormDirection === 'right' ? '➡️' : '⬅️'}</span>
            </div>
            <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-amber-900/40 px-4 py-1 rounded-full border border-amber-500/30 backdrop-blur-sm">
              <span className="text-amber-200 font-bold text-sm tracking-widest uppercase">Sandstorm Active</span>
            </div>
          </>
        )}
        <style>{`
          @keyframes sandParticleR {
            from { transform: translateX(-200px) rotate(0deg); opacity: 0; }
            20% { opacity: 1; }
            80% { opacity: 1; }
            to { transform: translateX(1000px) rotate(360deg); opacity: 0; }
          }
          @keyframes sandParticleL {
            from { transform: translateX(1000px) rotate(0deg); opacity: 0; }
            20% { opacity: 1; }
            80% { opacity: 1; }
            to { transform: translateX(-200px) rotate(-360deg); opacity: 0; }
          }
          @keyframes sandScrollR {
            from { background-position-x: 0; }
            to { background-position-x: 100px; }
          }
          @keyframes sandScrollL {
            from { background-position-x: 0; }
            to { background-position-x: -100px; }
          }
        `}</style>
      </div>
    );
  }

  // Graveyard
  if (mapId === 'graveyard') {
    const now = Date.now();
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Fog */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24 opacity-30"
          style={{ background: 'linear-gradient(to top, rgba(100, 100, 180, 0.4), transparent)' }}
        />

        {/* Lightning warnings */}
        {lightningStrikes.map(strike => {
          const elapsed = now - strike.warningStart;
          const isWarning = elapsed < 1500;
          const isStriking = elapsed >= 1500 && elapsed < 1700;

          return (
            <div key={strike.id}>
              {/* Warning indicator */}
              {isWarning && (
                <div
                  className="absolute"
                  style={{
                    left: strike.x - 20,
                    top: 0,
                    width: 40,
                    height: ARENA.height,
                    background: `rgba(255, 255, 100, ${0.1 + (elapsed / 1500) * 0.2})`,
                    borderLeft: '2px dashed rgba(255, 255, 0, 0.5)',
                    borderRight: '2px dashed rgba(255, 255, 0, 0.5)',
                    animation: elapsed > 1000 ? 'pulse 0.2s infinite' : undefined,
                  }}
                />
              )}
              {/* Lightning bolt */}
              {isStriking && (
                <div
                  className="absolute"
                  style={{
                    left: strike.x - 3,
                    top: 0,
                    width: 6,
                    height: ARENA.height,
                    background: 'rgba(255, 255, 255, 0.95)',
                    boxShadow: '0 0 20px rgba(255, 255, 100, 0.8), 0 0 40px rgba(255, 255, 0, 0.5)',
                    zIndex: 50,
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Soul zones */}
        {soulZones.map(zone => (
          <div
            key={zone.id}
            className="absolute rounded-full"
            style={{
              left: zone.x,
              top: zone.y,
              width: zone.width,
              height: zone.height,
              background: 'radial-gradient(circle, rgba(150, 200, 255, 0.3) 0%, rgba(100, 150, 255, 0.1) 60%, transparent 100%)',
              border: '1px solid rgba(150, 200, 255, 0.3)',
              boxShadow: '0 0 15px rgba(150, 200, 255, 0.2)',
              animation: 'pulse 2s ease-in-out infinite',
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center text-lg opacity-40">
              👻
            </div>
          </div>
        ))}

        {/* Ambient ghost particles */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`ghost-${i}`}
            className="absolute w-2 h-2 rounded-full opacity-30"
            style={{
              left: `${15 + i * 22}%`,
              top: `${25 + (i % 3) * 20}%`,
              background: 'rgba(180, 180, 255, 0.5)',
              animation: `float ${3 + i * 0.5}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.7}s`,
            }}
          />
        ))}
        <style>{`
          @keyframes float {
            0% { transform: translateY(0) scale(1); opacity: 0.3; }
            100% { transform: translateY(-20px) scale(1.2); opacity: 0.6; }
          }
        `}</style>
      </div>
    );
  }

  // Jungle
  if (mapId === 'jungle') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Canopy shadow */}
        <div
          className="absolute top-0 left-0 right-0 h-16 opacity-20"
          style={{ background: 'linear-gradient(to bottom, rgba(0, 80, 0, 0.5), transparent)' }}
        />

        {/* Overhead branches connect the hanging vines to the canopy. */}
        <svg className="absolute top-0 left-0 w-full h-12" viewBox="0 0 800 48" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-20 2 Q120 24 250 6 T510 10 T820 0" fill="none" stroke="#203b1c" strokeWidth="15" strokeLinecap="round" />
          <path d="M-20 0 Q120 19 250 3 T510 7 T820 -3" fill="none" stroke="#46612b" strokeWidth="5" strokeLinecap="round" />
          {Array.from({ length: 18 }, (_, i) => (
            <path key={i} d="M0 0 Q-18 -10 -27 3 Q-15 19 0 0 Q15 22 29 8 Q21 -8 0 0" fill={i % 2 ? '#305f2b' : '#3d7131'}
              transform={`translate(${i * 47}, ${10 + (i % 3) * 4}) rotate(${(i % 5) * 13 - 26})`} />
          ))}
        </svg>

        {/* Curved stems and alternating leaves stay inside each shield's bounds. */}
        {vineShields.filter(v => v.hp > 0 || v.destroyedAt !== undefined).map(vine => (
          <svg
            key={vine.id}
            className="absolute jungle-vine"
            viewBox={`0 0 48 ${vine.height}`}
            aria-hidden="true"
            style={{
              left: vine.x,
              top: vine.y,
              width: vine.width,
              height: vine.height,
              filter: 'drop-shadow(1px 2px 2px rgba(0, 25, 10, 0.35))',
              transformOrigin: '50% 0%',
              transformBox: 'fill-box',
              animation: vine.destroyedAt !== undefined
                ? 'vineBreak 700ms cubic-bezier(0.4, 0, 0.85, 0.35) forwards'
                : 'vineLower 1.25s cubic-bezier(0.2, 0.72, 0.28, 1) both, vineSway 4.8s ease-in-out 1.25s infinite',
            }}
          >
            <path
              d={`M24 -8 C10 ${vine.height * 0.18} 38 ${vine.height * 0.3} 24 ${vine.height * 0.48} S12 ${vine.height * 0.78} 24 ${vine.height - 4}`}
              fill="none" stroke="#294d20" strokeWidth="8" strokeLinecap="round"
            />
            <path
              d={`M23 -8 C9 ${vine.height * 0.18} 37 ${vine.height * 0.3} 23 ${vine.height * 0.48} S11 ${vine.height * 0.78} 23 ${vine.height - 4}`}
              fill="none" stroke="#6b8c3b" strokeWidth="2.5" strokeLinecap="round"
            />
            {Array.from({ length: Math.floor(vine.height / 30) }, (_, i) => {
              const y = 24 + i * 29;
              const side = i % 2 === 0 ? -1 : 1;
              const stemX = 24 - 5 * Math.sin((y / vine.height) * Math.PI * 3);
              const scale = 0.75 + ((i * 7 + Math.floor(vine.x)) % 5) * 0.05;
              return (
                <g key={i} transform={`translate(${stemX} ${y}) scale(${side * scale} ${scale}) rotate(${(i % 3) * 9 - 8})`}>
                  <path d="M0 0 Q9 -8 22 -17 Q24 1 12 5 Q5 6 0 0" fill={i % 3 === 0 ? '#659d3d' : '#448333'} stroke="#2c5b25" strokeWidth="1" />
                  <path d="M0 0 Q10 -3 20 -14 M9 -4 L10 -10 M13 -7 L19 -5" fill="none" stroke="#9fbe65" strokeWidth="0.8" opacity="0.65" />
                  {i % 3 === 1 && <path d="M0 2 Q-14 6 -9 17 Q-3 23 -2 15" fill="none" stroke="#6b8c3b" strokeWidth="1.4" />}
                </g>
              );
            })}
          </svg>
        ))}

        {/* Falling leaves */}
        {fallingLeaves.map(leaf => (
          <div
            key={leaf.id}
            className="absolute text-sm"
            style={{
              left: leaf.x,
              top: leaf.y,
              transform: `rotate(${leaf.rotation}deg)`,
              opacity: 0.7,
            }}
          >
            🍃
          </div>
        ))}
        <style>{`
          @keyframes vineLower {
            0% { transform: translateY(-34px) scaleY(0.02); opacity: 0; }
            72% { transform: translateY(5px) scaleY(1.015); opacity: 1; }
            88% { transform: translateY(-2px) scaleY(0.995); }
            100% { transform: translateY(0) scaleY(1); opacity: 1; }
          }
          @keyframes vineSway {
            0%, 100% { transform: rotate(-1deg); }
            50% { transform: rotate(1.2deg); }
          }
          @keyframes vineBreak {
            0% { transform: rotate(0deg) translateY(0) scaleY(1); opacity: 1; }
            28% { transform: rotate(5deg) translateY(4px) scaleY(0.97); opacity: 1; }
            100% { transform: rotate(20deg) translateY(34px) scaleY(0.72); opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .jungle-vine { animation: none !important; }
          }
        `}</style>
      </div>
    );
  }

  // Volcano
  if (mapId === 'volcano') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Lava glow at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: '22px',
            background: 'linear-gradient(to right, #ff4500, #ff6347, #ff4500)',
            boxShadow: '0 -10px 30px rgba(255, 69, 0, 0.4)',
            animation: 'pulse 1.5s infinite',
          }}
        />
        {/* Ember particles */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`ember-${i}`}
            className="absolute w-1.5 h-1.5 rounded-full"
            style={{
              left: `${5 + i * 12}%`,
              bottom: '22px',
              background: `rgba(255, ${150 + Math.random() * 100}, 50, 0.8)`,
              animation: `float ${2 + i * 0.3}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
        <style>{`
          @keyframes float {
            0% { transform: translateY(0) scale(1); opacity: 0.8; }
            100% { transform: translateY(-30px) scale(0.5); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  return null;
};

export default MapEffectsRenderer;
