import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapId, MAPS, GameMap } from '@/types/map';
import { Mountain, Skull, TreePine, Flame, Swords, Dices } from 'lucide-react';

interface MapSelectProps {
  onConfirm: (mapId: MapId) => void;
  onBack: () => void;
}

const mapIcons: Record<MapId, React.ReactNode> = {
  default: <Swords className="w-8 h-8" />,
  wasteland: <Mountain className="w-8 h-8" />,
  graveyard: <Skull className="w-8 h-8" />,
  jungle: <TreePine className="w-8 h-8" />,
  volcano: <Flame className="w-8 h-8" />,
};

const mapColors: Record<MapId, string> = {
  default: '#6366f1',
  wasteland: '#d97706',
  graveyard: '#6b21a8',
  jungle: '#16a34a',
  volcano: '#dc2626',
};

const MapCard = ({
  map,
  isSelected,
  onClick,
}: {
  map: GameMap;
  isSelected: boolean;
  onClick: () => void;
}) => (
  <Card
    className={`cursor-pointer transition-all duration-200 hover:scale-105 ${
      isSelected ? 'ring-2 ring-primary shadow-lg scale-105' : 'hover:shadow-md'
    }`}
    onClick={onClick}
  >
    <CardHeader className="pb-2">
      <div
        className="w-14 h-14 rounded-lg flex items-center justify-center text-primary-foreground mb-2"
        style={{ backgroundColor: mapColors[map.id] }}
      >
        {mapIcons[map.id]}
      </div>
      <CardTitle className="text-lg">{map.nameKo}</CardTitle>
      <CardDescription className="text-xs">{map.name}</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground mb-3">{map.description}</p>
      <div className="flex flex-wrap gap-1">
        {map.environmentEffects.map((effect, i) => (
          <Badge key={i} variant="outline" className="text-[10px]">
            {effect.type === 'sandstorm' && '🌪️ 모래폭풍'}
            {effect.type === 'lightning' && '⚡ 번개'}
            {effect.type === 'soul-zone' && '👻 영혼 영역'}
            {effect.type === 'falling-leaves' && '🍃 낙엽'}
            {effect.type === 'vine-shield' && '🌿 덩굴 방패'}
            {effect.type === 'lava-floor' && '🌋 용암 바닥'}
          </Badge>
        ))}
        {map.environmentEffects.length === 0 && (
          <Badge variant="outline" className="text-[10px]">없음</Badge>
        )}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        플랫폼: {map.platforms.filter(p => p.id !== 'ground').length}개
      </div>
    </CardContent>
  </Card>
);

const MapSelect = ({ onConfirm, onBack }: MapSelectProps) => {
  const [selectedMap, setSelectedMap] = useState<MapId>('default');
  const maps = Object.values(MAPS);

  const handleRandom = () => {
    const ids = Object.keys(MAPS) as MapId[];
    setSelectedMap(ids[Math.floor(Math.random() * ids.length)]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">맵 선택</h1>
          <p className="text-muted-foreground">전투할 맵을 선택하세요</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {maps.map((map) => (
            <MapCard
              key={map.id}
              map={map}
              isSelected={selectedMap === map.id}
              onClick={() => setSelectedMap(map.id)}
            />
          ))}
        </div>

        <div className="flex justify-center gap-4">
          <Button variant="outline" size="lg" onClick={onBack}>
            캐릭터 다시 선택
          </Button>
          <Button size="lg" variant="secondary" onClick={handleRandom} className="gap-2">
            <Dices className="h-5 w-5" />
            무작위 선택
          </Button>
          <Button size="lg" onClick={() => onConfirm(selectedMap)}>
            게임 시작
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MapSelect;
