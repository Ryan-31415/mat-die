// Game Types and Interfaces

export type GameScreen = 'menu' | 'character-select' | 'game' | 'result';

export type CharacterType = 'warrior' | 'ranger' | 'tank' | 'ninja';

export interface Character {
  id: CharacterType;
  name: string;
  nameKo: string;
  color: string;
  colorClass: string;
  maxHealth: number;
  speed: number;
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  skillCooldown: number;
  skillDescription: string;
  ultimateDescription: string;
}

export interface Player {
  id: 1 | 2;
  character: Character | null;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  ultimateGauge: number;
  skillCooldownRemaining: number;
  attackCooldownRemaining: number;
  isAttacking: boolean;
  isUsingSkill: boolean;
  isUsingUltimate: boolean;
  facingRight: boolean;
  velocityX: number;
  velocityY: number;
}

export interface GameState {
  screen: GameScreen;
  players: [Player, Player];
  currentRound: number;
  maxRounds: number;
  roundTimeLimit: number;
  roundTimeRemaining: number;
  scores: [number, number];
  isPaused: boolean;
  isRoundActive: boolean;
  winner: 1 | 2 | null;
  soundEnabled: boolean;
}

export interface GameSettings {
  maxRounds: 1 | 3 | 5;
  roundTimeLimit: number;
  soundEnabled: boolean;
}

// Character Definitions
export const CHARACTERS: Record<CharacterType, Character> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    nameKo: '워리어',
    color: '#ef4444',
    colorClass: 'bg-red-500',
    maxHealth: 100,
    speed: 5,
    attackDamage: 15,
    attackRange: 60,
    attackCooldown: 500,
    skillCooldown: 3000,
    skillDescription: '돌진 - 전방으로 빠르게 돌진하며 적에게 충돌 시 데미지',
    ultimateDescription: '분노 폭발 - 주변 광역 데미지 + 일시적 공격력 증가',
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    nameKo: '레인저',
    color: '#22c55e',
    colorClass: 'bg-green-500',
    maxHealth: 80,
    speed: 6,
    attackDamage: 10,
    attackRange: 200,
    attackCooldown: 600,
    skillCooldown: 4000,
    skillDescription: '트랩 설치 - 밟으면 슬로우 + 데미지',
    ultimateDescription: '화살 비 - 맵 전체에 화살비가 내려 광역 데미지',
  },
  tank: {
    id: 'tank',
    name: 'Tank',
    nameKo: '탱커',
    color: '#3b82f6',
    colorClass: 'bg-blue-500',
    maxHealth: 150,
    speed: 3,
    attackDamage: 8,
    attackRange: 50,
    attackCooldown: 700,
    skillCooldown: 5000,
    skillDescription: '방어 자세 - 2초간 받는 데미지 70% 감소',
    ultimateDescription: '지진 - 맵 전체 흔들림 + 적 스턴 2초',
  },
  ninja: {
    id: 'ninja',
    name: 'Ninja',
    nameKo: '닌자',
    color: '#a855f7',
    colorClass: 'bg-purple-500',
    maxHealth: 70,
    speed: 8,
    attackDamage: 8,
    attackRange: 120,
    attackCooldown: 300,
    skillCooldown: 3000,
    skillDescription: '순간이동 - 짧은 거리 텔레포트',
    ultimateDescription: '그림자 분신 - 3초간 분신 생성, 분신도 공격 가능',
  },
};

// Arena dimensions
export const ARENA = {
  width: 800,
  height: 500,
  padding: 20,
};

// Player size
export const PLAYER_SIZE = 50;

// Default game settings
export const DEFAULT_SETTINGS: GameSettings = {
  maxRounds: 3,
  roundTimeLimit: 60,
  soundEnabled: true,
};
