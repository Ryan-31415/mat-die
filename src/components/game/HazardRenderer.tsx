import { HazardZone } from '@/types/projectile';

interface HazardRendererProps {
  zone: HazardZone;
}

const HazardRenderer = ({ zone }: HazardRendererProps) => {
  const getHazardStyle = () => {
    switch (zone.type) {
      case 'fire-pool':
        return {
          background: 'radial-gradient(ellipse, rgba(255, 102, 0, 0.7), rgba(255, 0, 0, 0.4))',
          borderRadius: '50%',
          boxShadow: '0 0 15px rgba(255, 102, 0, 0.5)',
          animation: 'pulse 0.5s infinite',
        };
      case 'toxic-pool':
        return {
          background: 'radial-gradient(ellipse, rgba(0, 255, 136, 0.7), rgba(0, 102, 51, 0.4))',
          borderRadius: '50%',
          boxShadow: '0 0 15px rgba(0, 255, 136, 0.5)',
          animation: 'pulse 0.8s infinite',
        };
      case 'tesla-coil':
        return {
          background: 'linear-gradient(to top, #334, #556)',
          borderRadius: '4px',
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.8)',
          border: '2px solid #0ff',
        };
      case 'electric-explosion':
        return {
          background: 'radial-gradient(circle, rgba(255, 255, 255, 1), rgba(0, 200, 255, 0.8), rgba(0, 100, 200, 0.3), transparent)',
          borderRadius: '50%',
          boxShadow: '0 0 80px rgba(0, 255, 255, 1), 0 0 120px rgba(0, 200, 255, 0.8), inset 0 0 40px rgba(255, 255, 255, 1), 0 0 40px rgba(0, 150, 255, 0.9)',
          animation: 'pulse 0.08s infinite',
          zIndex: 100,
          border: '3px solid rgba(255, 255, 255, 0.9)',
        };
      default:
        return {};
    }
  };

  const remainingTime = zone.duration - (Date.now() - zone.createdAt);
  const healthPercentage = zone.health && zone.maxHealth
    ? (zone.health / zone.maxHealth) * 100
    : null;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: zone.x,
        top: zone.y,
        width: zone.width,
        height: zone.height,
        ...getHazardStyle(),
      }}
    >
      {/* Tesla coil health bar */}
      {zone.type === 'tesla-coil' && healthPercentage !== null && (
        <div className="absolute -top-3 left-0 right-0 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-400 transition-all"
            style={{ width: `${healthPercentage}%` }}
          />
        </div>
      )}

      {/* Electric arcs for tesla coil */}
      {zone.type === 'tesla-coil' && (
        <>
          {/* Range indicator */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-cyan-500/30"
            style={{
              width: (zone.attackRange || 150) * 2,
              height: (zone.attackRange || 150) * 2,
            }}
          />

          {/* Core */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-cyan-400 rounded-full"
            style={{
              boxShadow: '0 0 10px #0ff',
              animation: 'pulse 0.2s infinite',
            }}
          />

          {/* Lightning Attack Visual - properly positioned relative to the game area */}
          {zone.lastAttack && zone.lastAttackTarget && (Date.now() - zone.lastAttack < 200) && (
            <svg
              className="absolute pointer-events-none overflow-visible"
              style={{
                left: 0,
                top: 0,
                width: '100vw', // Use large width to ensure line covers distance
                height: '100vh',
                transform: `translate(${(zone.width / 2)}px, ${(zone.height / 2)}px)`, // Start from center of coil
                zIndex: 50
              }}
            >
              <line
                x1={0}
                y1={0}
                x2={zone.lastAttackTarget.x - zone.x + 25 - (zone.width / 2)} // Relative to coil center
                y2={zone.lastAttackTarget.y - zone.y + 25 - (zone.height / 2)} // Relative to coil center
                stroke="#0ff"
                strokeWidth="3"
                strokeDasharray="10,5"
              >
                <animate attributeName="stroke-dashoffset" from="100" to="0" dur="0.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0" dur="0.2s" repeatCount="1" />
              </line>
              {/* Secondary jagged line for lightning feel */}
              <line
                x1={0}
                y1={0}
                x2={zone.lastAttackTarget.x - zone.x + 25 - (zone.width / 2)}
                y2={zone.lastAttackTarget.y - zone.y + 25 - (zone.height / 2)}
                stroke="white"
                strokeWidth="1"
                filter="drop-shadow(0 0 5px #0ff)"
              />
            </svg>
          )}
        </>
      )}
    </div>
  );
};

export default HazardRenderer;
