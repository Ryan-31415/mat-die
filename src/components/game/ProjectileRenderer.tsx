import { Projectile } from '@/types/projectile';

interface ProjectileRendererProps {
  projectile: Projectile;
}

const ProjectileRenderer = ({ projectile }: ProjectileRendererProps) => {
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
          background: 'radial-gradient(circle, #ff6600, #ff0000)',
          borderRadius: '50%',
          boxShadow: '0 0 15px #ff6600',
        };
      case 'large-fireball':
        return {
          background: 'radial-gradient(circle, #ffcc00, #ff6600, #ff0000)',
          borderRadius: '50%',
          boxShadow: '0 0 25px #ff6600',
        };
      case 'meteor':
        return {
          background: 'radial-gradient(circle, #ffcc00, #ff6600)',
          borderRadius: '50%',
          boxShadow: '0 0 20px #ff6600, 0 0 40px #ff0000',
        };
      case 'flask':
        return {
          background: 'radial-gradient(circle, #00ff88, #006633)',
          borderRadius: '50%',
          boxShadow: '0 0 10px #00ff88',
          transform: `rotate(${Date.now() / 10 % 360}deg)`,
        };
      case 'electric-orb':
        return {
          background: 'radial-gradient(circle, #00ffff, #0088ff, #0044aa)',
          borderRadius: '50%',
          boxShadow: '0 0 20px #00ffff, 0 0 40px #0088ff',
          animation: 'pulse 0.1s infinite',
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
        left: projectile.x - projectile.width / 2,
        top: projectile.y - projectile.height / 2,
        width: projectile.width,
        height: projectile.height,
        ...getProjectileStyle(),
      }}
    />
  );
};

export default ProjectileRenderer;
