import { Platform } from './platform';

export type MapId = 'default' | 'wasteland' | 'graveyard' | 'jungle' | 'volcano';

export interface MapEnvironmentEffect {
  type: 'sandstorm' | 'lightning' | 'soul-zone' | 'falling-leaves' | 'vine-shield' | 'lava-floor';
}

export interface GameMap {
  id: MapId;
  name: string;
  nameKo: string;
  description: string;
  platforms: Platform[];
  bgGradient: string; // tailwind gradient classes
  arenaStyle: React.CSSProperties;
  groundStyle?: React.CSSProperties;
  environmentEffects: MapEnvironmentEffect[];
  hasLavaFloor?: boolean;
}

export const MAPS: Record<MapId, GameMap> = {
  default: {
    id: 'default',
    name: 'Default Arena',
    nameKo: '기본 아레나',
    description: '환경 요소 없음',
    platforms: [
      { id: 'ground', x: 0, y: 480, width: 800, height: 20, type: 'solid' },
      { id: 'platform-left', x: 80, y: 350, width: 180, height: 15, type: 'one-way' },
      { id: 'platform-right', x: 540, y: 350, width: 180, height: 15, type: 'one-way' },
      { id: 'platform-center', x: 300, y: 250, width: 200, height: 15, type: 'one-way' },
      { id: 'platform-small-left', x: 150, y: 180, width: 100, height: 12, type: 'one-way' },
      { id: 'platform-small-right', x: 550, y: 180, width: 100, height: 12, type: 'one-way' },
    ],
    bgGradient: 'from-muted/50 to-muted',
    arenaStyle: {},
    environmentEffects: [],
  },
  wasteland: {
    id: 'wasteland',
    name: 'Wasteland',
    nameKo: '황야',
    description: '랜덤 주기마다 모래폭풍이 몰아칩니다',
    platforms: [
      { id: 'ground', x: 0, y: 480, width: 800, height: 20, type: 'solid' },
    ],
    bgGradient: 'from-amber-900/40 to-yellow-800/50',
    arenaStyle: { backgroundColor: 'rgba(180, 140, 80, 0.15)' },
    groundStyle: { background: 'linear-gradient(to right, #b8860b, #d2a94c, #b8860b)' },
    environmentEffects: [{ type: 'sandstorm' }],
  },
  graveyard: {
    id: 'graveyard',
    name: 'Graveyard',
    nameKo: '공동묘지',
    description: '번개가 치고 영혼 영역이 생성됩니다',
    platforms: [
      { id: 'ground', x: 0, y: 480, width: 800, height: 20, type: 'solid' },
      { id: 'platform-left', x: 120, y: 340, width: 200, height: 15, type: 'one-way' },
      { id: 'platform-right', x: 480, y: 340, width: 200, height: 15, type: 'one-way' },
    ],
    bgGradient: 'from-slate-900/60 to-indigo-950/50',
    arenaStyle: { backgroundColor: 'rgba(30, 20, 50, 0.25)' },
    groundStyle: { background: 'linear-gradient(to right, #2d3436, #636e72, #2d3436)' },
    environmentEffects: [{ type: 'lightning' }, { type: 'soul-zone' }],
  },
  jungle: {
    id: 'jungle',
    name: 'Jungle',
    nameKo: '정글',
    description: '잎이 떨어지고 덩굴이 투사체를 차단합니다',
    platforms: [
      { id: 'ground', x: 0, y: 480, width: 800, height: 20, type: 'solid' },
      { id: 'platform-left-low', x: 50, y: 380, width: 160, height: 15, type: 'one-way' },
      { id: 'platform-right-low', x: 590, y: 380, width: 160, height: 15, type: 'one-way' },
      { id: 'platform-center', x: 280, y: 290, width: 240, height: 15, type: 'one-way' },
      { id: 'platform-left-high', x: 100, y: 200, width: 140, height: 12, type: 'one-way' },
      { id: 'platform-right-high', x: 560, y: 200, width: 140, height: 12, type: 'one-way' },
      { id: 'platform-center-high', x: 310, y: 110, width: 180, height: 12, type: 'one-way' },
    ],
    bgGradient: 'from-green-900/40 to-emerald-800/40',
    arenaStyle: { backgroundColor: 'rgba(20, 80, 40, 0.15)' },
    groundStyle: { background: 'linear-gradient(to right, #2d5016, #3a6b23, #2d5016)' },
    environmentEffects: [{ type: 'falling-leaves' }, { type: 'vine-shield' }],
  },
  volcano: {
    id: 'volcano',
    name: 'Volcano',
    nameKo: '화산',
    description: '바닥이 용암으로 되어 있습니다',
    platforms: [
      // NO solid ground - lava is the floor
      { id: 'ground', x: 0, y: 480, width: 800, height: 20, type: 'solid' },
      { id: 'platform-left', x: 80, y: 360, width: 200, height: 15, type: 'one-way' },
      { id: 'platform-center', x: 300, y: 260, width: 200, height: 15, type: 'one-way' },
      { id: 'platform-right', x: 520, y: 360, width: 200, height: 15, type: 'one-way' },
    ],
    bgGradient: 'from-red-950/50 to-orange-900/40',
    arenaStyle: { backgroundColor: 'rgba(100, 20, 10, 0.15)' },
    groundStyle: {
      background: 'linear-gradient(to right, #ff4500, #ff6347, #ff4500)',
      boxShadow: '0 0 20px rgba(255, 69, 0, 0.6)',
    },
    environmentEffects: [{ type: 'lava-floor' }],
    hasLavaFloor: true,
  },
};
