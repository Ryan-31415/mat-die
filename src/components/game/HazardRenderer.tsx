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
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-cyan-400 rounded-full"
          style={{
            boxShadow: '0 0 10px #0ff',
            animation: 'pulse 0.2s infinite',
          }}
        />
      )}
    </div>
  );
};

export default HazardRenderer;
