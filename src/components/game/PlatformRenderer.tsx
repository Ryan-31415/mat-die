import { Platform } from '@/types/platform';
import { MapId } from '@/types/map';

interface PlatformRendererProps {
  platform: Platform;
  mapId?: MapId;
}

const getMapPlatformStyle = (mapId?: MapId): string => {
  switch (mapId) {
    case 'wasteland':
      return 'bg-gradient-to-b from-amber-700/70 to-amber-800/50 border-t-2 border-amber-600';
    case 'graveyard':
      return 'bg-gradient-to-b from-slate-700/70 to-slate-800/50 border-t-2 border-slate-500';
    case 'jungle':
      return 'bg-gradient-to-b from-green-700/70 to-green-800/50 border-t-2 border-green-500';
    case 'volcano':
      return 'bg-gradient-to-b from-stone-700/70 to-stone-800/50 border-t-2 border-orange-600';
    default:
      return 'bg-gradient-to-b from-primary/70 to-primary/50 border-t-2 border-primary';
  }
};

const PlatformRenderer = ({ platform, mapId }: PlatformRendererProps) => {
  if (platform.id === 'ground') return null;

  const oneWayStyle = platform.type === 'one-way'
    ? getMapPlatformStyle(mapId)
    : 'bg-muted border-2 border-border';

  return (
    <div
      className={`absolute ${oneWayStyle} rounded-sm`}
      style={{
        left: platform.x,
        top: platform.y,
        width: platform.width,
        height: platform.height,
      }}
    >
      <div className="absolute inset-x-2 top-0 h-1 bg-primary-foreground/20 rounded-full" />
    </div>
  );
};

export default PlatformRenderer;
