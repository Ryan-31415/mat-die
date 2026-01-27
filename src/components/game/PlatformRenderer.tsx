import { Platform } from '@/types/platform';

interface PlatformRendererProps {
  platform: Platform;
}

const PlatformRenderer = ({ platform }: PlatformRendererProps) => {
  // Don't render ground platform (it's invisible, handled by arena)
  if (platform.id === 'ground') return null;

  return (
    <div
      className={`absolute ${
        platform.type === 'one-way' 
          ? 'bg-gradient-to-b from-primary/70 to-primary/50 border-t-2 border-primary' 
          : 'bg-muted border-2 border-border'
      } rounded-sm`}
      style={{
        left: platform.x,
        top: platform.y,
        width: platform.width,
        height: platform.height,
      }}
    >
      {/* Platform surface detail */}
      <div 
        className="absolute inset-x-2 top-0 h-1 bg-primary-foreground/20 rounded-full"
      />
    </div>
  );
};

export default PlatformRenderer;
