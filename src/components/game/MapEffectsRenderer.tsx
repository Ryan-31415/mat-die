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
        {sandstormActive && (
          <>
            {/* Sand overlay */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(${sandstormDirection === 'right' ? '90deg' : '270deg'}, 
                  rgba(180, 140, 60, 0.3), rgba(200, 160, 80, 0.15), transparent)`,
                animation: 'pulse 0.5s infinite',
              }}
            />
            {/* Sand particles */}
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={`sand-${i}`}
                className="absolute rounded-full"
                style={{
                  width: 2 + Math.random() * 3,
                  height: 2 + Math.random() * 3,
                  background: `rgba(${180 + Math.random() * 40}, ${140 + Math.random() * 30}, ${60 + Math.random() * 20}, ${0.4 + Math.random() * 0.4})`,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `sandParticle${sandstormDirection === 'right' ? 'R' : 'L'} ${0.5 + Math.random() * 1}s linear infinite`,
                  animationDelay: `${Math.random() * 1}s`,
                }}
              />
            ))}
          </>
        )}
        <style>{`
          @keyframes sandParticleR {
            from { transform: translateX(-100px); opacity: 0; }
            50% { opacity: 1; }
            to { transform: translateX(800px); opacity: 0; }
          }
          @keyframes sandParticleL {
            from { transform: translateX(900px); opacity: 0; }
            50% { opacity: 1; }
            to { transform: translateX(0px); opacity: 0; }
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

        {/* Vine shields */}
        {vineShields.filter(v => v.hp > 0).map(vine => (
          <div
            key={vine.id}
            className="absolute"
            style={{
              left: vine.x,
              top: vine.y,
              width: vine.width,
              height: vine.height,
              background: 'linear-gradient(180deg, #2d5016, #3a6b23)',
              borderRadius: '4px',
              border: '2px solid #4ade80',
              boxShadow: '0 0 8px rgba(74, 222, 128, 0.3)',
            }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-xs">🌿</div>
          </div>
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
