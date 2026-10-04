import type { ExplosionEffect } from '@/types/projectile';

interface ExplosionRendererProps {
  effect: ExplosionEffect;
  isPaused: boolean;
}

const ExplosionRenderer = ({ effect, isPaused }: ExplosionRendererProps) => {
  const color = effect.type === 'electric-orb'
    ? 'hsl(190 100% 60%)'
    : effect.type === 'flask'
      ? 'hsl(150 100% 55%)'
      : 'hsl(25 100% 55%)';
  const animationStyle = {
    animationDuration: `${effect.duration}ms`,
    animationPlayState: isPaused ? 'paused' as const : 'running' as const,
  };

  return (
    <div
      className="absolute pointer-events-none"
      aria-hidden="true"
      style={{
        left: effect.x - effect.radius,
        top: effect.y - effect.radius,
        width: effect.radius * 2,
        height: effect.radius * 2,
        color,
        zIndex: 60,
      }}
    >
      <div
        className="absolute inset-0 rounded-full explosion-flash"
        style={{
          ...animationStyle,
          background: `radial-gradient(circle, hsl(0 0% 100% / 0.95), ${color} 35%, transparent 70%)`,
        }}
      />
      <div
        className="absolute inset-0 rounded-full border-2 border-current explosion-ring"
        style={{ ...animationStyle, boxShadow: `0 0 16px ${color}, inset 0 0 12px ${color}` }}
      />
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="absolute inset-0"
          style={{ transform: `rotate(${index * 45}deg)` }}
        >
          <div
            className="absolute left-1/2 top-1/2 w-1 h-3 rounded-full bg-current explosion-spark"
            style={animationStyle}
          />
        </div>
      ))}
    </div>
  );
};

export default ExplosionRenderer;
