import { Projectile } from '@/types/projectile';

interface ProjectileRendererProps {
  projectile: Projectile;
}

const ProjectileRenderer = ({ projectile }: ProjectileRendererProps) => {
  if (projectile.type === 'rocket' || projectile.type === 'homing-rocket') {
    const color = projectile.type === 'rocket' ? '#ef4444' : '#3b82f6';
    const angle = Math.atan2(projectile.velocityY, projectile.velocityX) * 180 / Math.PI;
    return (
      <div className="absolute pointer-events-none" aria-label={projectile.isNapalm ? '네이팜 로켓' : projectile.type === 'rocket' ? '무유도 로켓' : '유도 로켓'}
        style={{ left: projectile.x, top: projectile.y, width: projectile.width, height: projectile.height,
          transform: `rotate(${angle}deg)`, filter: projectile.isNapalm ? 'drop-shadow(0 0 6px #f97316)' : undefined }}>
        <svg viewBox="0 0 36 24" className="w-full h-full overflow-visible">
          <path d="M7 8 L-6 12 L7 16 Z" fill="#f97316" />
          <path d="M7 10 L0 12 L7 14 Z" fill="#fef08a" />
          <path d="M8 9 L5 2 L16 8 M8 15 L5 22 L16 16" fill={color} />
          <rect x="6" y="8" width="20" height="8" rx="3" fill="#fff" stroke="#94a3b8" />
          <path d="M26 8 L35 12 L26 16 Z" fill={color} />
          {projectile.isNapalm && <path d="M12 11 L15 8 L18 12 L15 16 Z" fill="#f97316" />}
        </svg>
      </div>
    );
  }
  // Special case for Archer arrows to have hitbox larger than visual
  if (projectile.type === 'arrow' || projectile.type === 'poison-arrow') {
    const angle = Math.atan2(projectile.velocityY, projectile.velocityX) * (180 / Math.PI);
    return (
      <div
        className="absolute pointer-events-none flex items-center justify-center"
        style={{
          left: projectile.x,
          top: projectile.y,
          width: projectile.width,
          height: projectile.height,
        }}
      >
        <div
          style={{
            width: '48px', // Fixed visual size
            height: '6px',
            backgroundColor: projectile.type === 'arrow' ? '#8B4513' : '#22c55e',
            borderRadius: '2px',
            boxShadow: projectile.type === 'poison-arrow' ? '0 0 8px #22c55e' : 'none',
            transform: `rotate(${angle}deg)`,
          }}
        />
      </div>
    );
  }

  if (projectile.type === 'bat') {
    // Calculate rotation angle based on velocity direction
    // SVG bat is facing upward by default, so add 90 degrees to face right
    const angle = Math.atan2(projectile.velocityY, projectile.velocityX) * (180 / Math.PI) + 90;
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: projectile.x,
          top: projectile.y,
          width: projectile.width,
          height: projectile.height,
          transform: `rotate(${angle}deg)`,
        }}
      >
        <div className="w-full h-full animate-pulse">
          <svg viewBox="0 0 50 50" className="w-full h-full drop-shadow-[0_0_12px_#312e81]">
            <path
              d="M25,20 C15,10 0,15 5,30 C5,25 15,25 25,35 C35,25 45,25 45,30 C50,15 35,10 25,20"
              fill="#1e1b4b"
              stroke="#312e81"
              strokeWidth="1.5"
            />
            {/* Eyes */}
            <circle cx="21" cy="22" r="1.5" fill="#ef4444" />
            <circle cx="29" cy="22" r="1.5" fill="#ef4444" />
          </svg>
        </div>
      </div>
    );
  }

  const getProjectileStyle = () => {
    switch (projectile.type) {
      case 'fireball':
        return {
          background: 'radial-gradient(circle, #ffff99, #ff9900, #ff3300)',
          borderRadius: '50%',
          boxShadow: '0 0 25px #ff6600, 0 0 45px #ff0000, inset 0 0 10px #ffff99',
        };
      case 'large-fireball':
        return {
          background: 'radial-gradient(circle, #ffff00, #ffcc00, #ff6600, #ff0000)',
          borderRadius: '50%',
          boxShadow: '0 0 40px #ff6600, 0 0 60px #ff0000, inset 0 0 20px #ffff00',
        };
      case 'meteor':
        return {
          background: 'radial-gradient(circle, #ffff99, #ffcc00, #ff6600, #ff3300)',
          borderRadius: '50%',
          boxShadow: '0 0 35px #ff6600, 0 0 55px #ff0000, inset 0 0 15px #ffff99',
        };
      case 'flask':
        return {
          background: 'radial-gradient(circle, #00ff88, #00dd66, #00aa44, #006633)',
          borderRadius: '50%',
          boxShadow: '0 0 15px #00ff88, 0 0 30px #00dd66, inset 0 0 10px #00ff88',
          transform: `rotate(${Date.now() / 10 % 360}deg)`,
        };
      case 'electric-orb': {
        const chargeLevel = projectile.chargeLevel || 0;
        const isMaxCharge = chargeLevel >= 1;
        return {
          background: isMaxCharge
            ? 'radial-gradient(circle, #ffffff, #00ffff, #0000ff)'
            : 'radial-gradient(circle, #ffffff, #00ffff, #0088ff, #0044aa)',
          borderRadius: '50%',
          boxShadow: isMaxCharge
            ? `0 0 45px #00ffff, 0 0 70px #0000ff, inset 0 0 25px #ffffff`
            : `0 0 ${35}px #00ffff, 0 0 ${60}px #0088ff, inset 0 0 20px #ffffff`,
          animation: isMaxCharge ? 'pulse 0.05s infinite' : 'pulse 0.08s infinite',
          border: isMaxCharge ? '2px solid #fff' : 'none',
        };
      }
      case 'bullet':
        return {
          backgroundColor: '#374151', // Dark gray
          borderRadius: '2px',
          boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          transform: `rotate(${Math.atan2(projectile.velocityY, projectile.velocityX) * (180 / Math.PI)}deg)`,
        };
      case 'super-bullet':
        return {
          backgroundColor: '#ff6600', // Orange as requested
          borderRadius: '4px',
          boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          transform: `rotate(${Math.atan2(projectile.velocityY, projectile.velocityX) * (180 / Math.PI)}deg)`,
        };
      case 'snowball':
        return {
          background: 'radial-gradient(circle, #ffffff, #3393c0)',
          borderRadius: '25%',
          boxShadow: '0 0 12px #4bafdd, inset 0 0 6px #ffffff',
        };
      case 'large-snowball':
        return {
          background: 'radial-gradient(circle, #ffffff, #3393c0)',
          borderRadius: '25%',
          boxShadow: '0 0 12px #4bafdd, inset 0 0 6px #ffffff',
        };
      case 'blizzard-stone':
        return {
          background: 'radial-gradient(circle, #e0f7fa, #81d4fa, #29b6f6)',
          borderRadius: '40%', // Irregular jagged shape approximation
          boxShadow: '0 0 15px #4fc3f7, inset 0 0 10px #ffffff',
          transform: `rotate(${Date.now() / 5 % 360}deg)`, // Fast spin
        };
      case 'net':
        return {
          background: 'transparent',
          borderRadius: '50%',
          border: '2px solid #8B4513',
          boxShadow: 'inset 0 0 10px #8B4513',
          backgroundImage: 'radial-gradient(#8B4513 1px, transparent 1px)',
          backgroundSize: '8px 8px',
          transform: `rotate(${Date.now() / 5 % 360}deg)`,
        };
      case 'hacker-missile':
        return {
          backgroundColor: '#84cc16', // lime-500 yellow-green
          borderRadius: '2px', // Square
          boxShadow: '0 0 8px #84cc16',
          border: '1px solid #fff',
        };
      default:
        return {
          backgroundColor: '#fff',
          borderRadius: '50%',
        };
    }
  };

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: projectile.x,
        top: projectile.y,
        width: projectile.width,
        height: projectile.height,
        ...getProjectileStyle(),
      }}
    />
  );
};

export default ProjectileRenderer;
