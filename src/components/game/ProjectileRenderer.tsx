import { Projectile } from '@/types/projectile';

interface ProjectileRendererProps {
  projectile: Projectile;
}

const ProjectileRenderer = ({ projectile }: ProjectileRendererProps) => {
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
      case 'arrow':
        return {
          backgroundColor: '#8B4513',
          borderRadius: '2px',
          transform: `rotate(${Math.atan2(projectile.velocityY, projectile.velocityX) * (180 / Math.PI)}deg)`,
        };
      case 'poison-arrow':
        return {
          backgroundColor: '#22c55e',
          borderRadius: '2px',
          boxShadow: '0 0 8px #22c55e',
          transform: `rotate(${Math.atan2(projectile.velocityY, projectile.velocityX) * (180 / Math.PI)}deg)`,
        };
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
      case 'electric-orb':
        return {
          background: 'radial-gradient(circle, #ffffff, #00ffff, #0088ff, #0044aa)',
          borderRadius: '50%',
          boxShadow: '0 0 35px #00ffff, 0 0 60px #0088ff, inset 0 0 20px #ffffff',
          animation: 'pulse 0.08s infinite',
        };
      case 'bullet':
        return {
          backgroundColor: '#374151', // Dark gray
          borderRadius: '2px',
          boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          transform: `rotate(${Math.atan2(projectile.velocityY, projectile.velocityX) * (180 / Math.PI)}deg)`,
        };
      case 'slug':
        return {
          background: 'radial-gradient(circle, #374151, #1f2937)', // Dark gray
          borderRadius: '50%',
          boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          transform: `rotate(${Math.atan2(projectile.velocityY, projectile.velocityX) * (180 / Math.PI)}deg)`,
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
