import { HazardZone } from '@/types/projectile';

interface HazardRendererProps {
  zone: HazardZone;
}

import { useRef, useEffect } from 'react';

const HazardRenderer = ({ zone }: HazardRendererProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Matrix effect for packet block zone
  useEffect(() => {
    if (zone.type !== 'packet-block-zone' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const columns = Math.floor(canvas.width / 10);
    const drops: number[] = new Array(columns).fill(1);

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#84cc16'; // lime-500
      ctx.font = '10px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = String.fromCharCode(0x30A0 + Math.random() * 96);
        ctx.fillText(text, i * 10, drops[i] * 10);

        if (drops[i] * 10 > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationFrameId);
  }, [zone.type, zone.width, zone.height]);

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
      case 'bear-trap':
        const age = Date.now() - zone.createdAt;
        const isTransparent = age > 1500;
        return {
          background: 'linear-gradient(45deg, #4b5563, #1f2937)',
          border: '2px solid #374151',
          borderRadius: '4px',
          boxShadow: isTransparent ? 'none' : '0 2px 4px rgba(0,0,0,0.5)',
          opacity: isTransparent ? 0 : 1,
          transition: 'opacity 0.5s ease-in-out',
        };
      case 'blizzard':
        return {
          background: 'radial-gradient(circle, rgba(200, 230, 255, 0.4) 0%, rgba(100, 180, 255, 0.2) 60%, transparent 100%)',
          borderRadius: '50%',
          boxShadow: '0 0 20px rgba(135, 206, 235, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
        };
      case 'fire-ring':
        return {
          background: 'transparent',
          borderRadius: '50%',
          border: '6px solid rgba(255, 100, 0, 0.8)',
          boxShadow: '0 0 30px rgba(255, 102, 0, 0.8), inset 0 0 30px rgba(255, 0, 0, 0.4)',
          animation: 'pulse 0.3s infinite',
        };
      case 'packet-block-zone':
        return {
          background: 'rgba(0, 0, 0, 0.3)',
          border: '2px solid #84cc16', // lime-500
          boxShadow: '0 0 15px rgba(132, 204, 22, 0.4)',
          zIndex: 5,
          overflow: 'hidden', // Contain the matrix canvas
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

      {/* Matrix Hazard Effect */}
      {zone.type === 'packet-block-zone' && (
        <canvas
          ref={canvasRef}
          width={zone.width}
          height={zone.height}
          className="absolute top-0 left-0 w-full h-full opacity-50 pointer-events-none"
        />
      )}
    </div>
  );
};

export default HazardRenderer;
