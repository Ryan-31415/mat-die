// Game Types and Interfaces

export type GameScreen = 'menu' | 'character-select' | 'game' | 'result';

export type CharacterType = 'gladiator' | 'archer' | 'mage' | 'ninja' | 'scientist' | 'hunter' | 'reaper' | 'ice-mage';

export type GameMode = 'single' | 'multi';

export interface CharacterAbility {
  name: string;
  description: string;
  manaCost: number; // percentage (0-100)
  cooldown: number; // milliseconds
}

export interface Character {
  id: CharacterType;
  name: string;
  nameKo: string;
  color: string;
  colorClass: string;
  maxHealth: number;
  maxMana: number;
  manaRegen: number; // mana per second (percentage)
  speed: number;
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  skill: CharacterAbility;
  ultimate: CharacterAbility;
  passive?: string;
}

export interface Player {
  id: 1 | 2;
  character: Character | null;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  skillCooldownRemaining: number;
  attackCooldownRemaining: number;
  isAttacking: boolean;
  isUsingSkill: boolean;
  isUsingUltimate: boolean;
  facingRight: boolean;
  velocityX: number;
  velocityY: number;
  knockbackVelocityX: number;
  knockbackVelocityY: number;
  // Physics
  isGrounded: boolean;
  lastGroundedTime: number;
  isJumping: boolean;
  canDoubleJump: boolean;
  // Status effects
  isShielding: boolean;
  isPoisoned: boolean;
  poisonDuration: number;
  isSlowed: boolean;
  slowDuration: number;
  slowAmount: number;
  isStunned: boolean;
  stunDuration: number;
  isDashing: boolean;
  isInvisible: boolean;
  invisibleDuration: number;
  dodgesRemaining: number;
  damageBoost: number;
  speedBoost: number;
  damageReduction: number;
  buffDuration: number;
  // Hunter specific
  rootDuration: number;
  healthRegen: number;
  regenDuration: number;
  poisonArrowsRemaining: number;
  isInvulnerable: boolean;
  invulnerableDuration: number;
  isFlying: boolean;
  lastUltTick?: number;
  trailPositions?: Array<{ x: number; y: number; timestamp: number }>;
  // Ice Mage specific
  freezeGauge: number;
  isFrozen: boolean;
  frozenDuration: number;
  lastHitByIceMage: number;
  lastFreezeGaugeDecay: number;
  // Clone
  isClone: boolean;
  createdAt: number;
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
  gameMode: GameMode;
}

// Character Definitions
export const CHARACTERS: Record<CharacterType, Character> = {
  gladiator: {
    id: 'gladiator',
    name: 'Gladiator',
    nameKo: '검투사',
    color: '#dc2626',
    colorClass: 'bg-red-600',
    maxHealth: 150,
    maxMana: 100,
    manaRegen: 6.7, // Reduced to 60%
    speed: 5.0,
    attackDamage: 16,
    attackRange: 80,
    attackCooldown: 800,
    skill: {
      name: '방어',
      description: '스킬 버튼을 누르고 있는 동안 방패를 들어 전방의 공격을 반사합니다. 이동속도가 50% 감소합니다.',
      manaCost: 15, // per 0.5 seconds
      cooldown: 0,
    },
    ultimate: {
      name: '분노',
      description: '5초간 공격력 35% 상승, 이동속도 30% 상승, 받는 피해 25% 감소. 초당 체력 4% 재생.',
      manaCost: 100,
      cooldown: 0,
    },
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    nameKo: '궁수',
    color: '#16a34a',
    colorClass: 'bg-green-600',
    maxHealth: 110,
    maxMana: 100,
    manaRegen: 6.6,
    speed: 5.2,
    attackDamage: 15,
    attackRange: 600,
    attackCooldown: 600,
    skill: {
      name: '독성 강화',
      description: '다음 3발의 기본 공격을 독 화살로 강화합니다. 피격 시 5초간 독 효과(이동속도 33% 감소, 지속 피해)를 부여합니다.',
      manaCost: 35,
      cooldown: 5000,
    },
    ultimate: {
      name: '화살 폭풍',
      description: '전방으로 화살 5발을 2번 연속 발사합니다.',
      manaCost: 100,
      cooldown: 0,
    },
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    nameKo: '마법사',
    color: '#7c3aed',
    colorClass: 'bg-violet-600',
    maxHealth: 95,
    maxMana: 100,
    manaRegen: 6.8,
    speed: 4.9,
    attackDamage: 18,
    attackRange: 600,
    attackCooldown: 1000,
    skill: {
      name: '대형 파이어볼',
      description: '상대 위치에 커다란 파이어볼을 투하합니다. 화염구는 플레이어 또는 바닥에 닿으면 4초간 화염 영역을 생성합니다.',
      manaCost: 40,
      cooldown: 4500,
    },
    ultimate: {
      name: '유성우',
      description: '맵 전역에 파이어볼 13개를 무작위로 투하합니다.',
      manaCost: 100,
      cooldown: 0,
    },
  },
  ninja: {
    id: 'ninja',
    name: 'Ninja',
    nameKo: '닌자',
    color: '#1e293b',
    colorClass: 'bg-slate-800',
    maxHealth: 115,
    maxMana: 100,
    manaRegen: 6.6,
    speed: 5.5, // slightly faster base speed
    attackDamage: 15,
    attackRange: 85,
    attackCooldown: 1000,
    passive: '카타나로 적의 투사체를 반사 가능.',
    skill: {
      name: '질풍 돌진',
      description: '전방으로 돌진.',
      manaCost: 30,
      cooldown: 1500,
    },
    ultimate: {
      name: '그림자 은신',
      description: '4초간 은신하며(공격력 50% 상승, 이동속도 60% 상승, 공격 2회 회피), 6초간 지속되는 자신의 분신을 소환합니다.',
      manaCost: 100,
      cooldown: 0,
    },
  },
  scientist: {
    id: 'scientist',
    name: 'Scientist',
    nameKo: '과학자',
    color: '#0891b2',
    colorClass: 'bg-cyan-600',
    maxHealth: 100,
    maxMana: 100,
    manaRegen: 6.6,
    speed: 4.6,
    attackDamage: 13,
    attackRange: 500, // Increased range (still shorter than Archer's 600)
    attackCooldown: 900,
    skill: {
      name: '전자총',
      description: '전기 구체를 발사해 강한 피해와 넉백을 입힙니다. 피격된 적은 1초간 기절하고 4.5초간 이동속도가 40% 감소합니다.',
      manaCost: 45,
      cooldown: 5500,
    },
    ultimate: {
      name: '테슬라 코일',
      description: '제자리에 테슬라 코일 설치. 주변 적을 자동 공격. 파괴 시 강력한 폭발.',
      manaCost: 100,
      cooldown: 0,
    },
  },
  hunter: {
    id: 'hunter',
    name: 'Hunter',
    nameKo: '사냥꾼',
    color: '#92400e',
    colorClass: 'bg-amber-800',
    maxHealth: 135,
    maxMana: 100,
    manaRegen: 6.5,
    speed: 4.7,
    attackDamage: 14,
    attackRange: 200,
    attackCooldown: 1100,
    skill: {
      name: '함정',
      description: '바닥에 함정을 설치합니다. 설치 1.5초 후 투명해지며, 밟은 적에게 피해를 입히고, 2초간 속박하며 4초간 이동속도를 50% 감소시킵니다. (최대 1개)',
      manaCost: 50,
      cooldown: 6000,
    },
    ultimate: {
      name: '슈퍼 샷건',
      description: '더 강력한 산탄총으로 9발의 총알을 발사합니다.',
      manaCost: 100,
      cooldown: 0,
    },
  },
  reaper: {
    id: 'reaper',
    name: 'Reaper',
    nameKo: '사신',
    color: '#475569',
    colorClass: 'bg-slate-600',
    maxHealth: 115,
    maxMana: 100,
    manaRegen: 6.7,
    speed: 5.2,
    attackDamage: 14,
    attackRange: 110,
    attackCooldown: 1100,
    passive: '흡혈: 가한 데미지의 20%를 체력으로 회복합니다.',
    skill: {
      name: '박쥐',
      description: '부메랑처럼 돌아오는 박쥐를 내보냅니다. 돌아올 때 스킬로 입힌 피해의 50%를 추가 회복합니다.',
      manaCost: 45,
      cooldown: 5000,
    },
    ultimate: {
      name: '유체화',
      description: '2.5초간 무적 상태로 비행하며 접촉한 적에게 지속 피해와 둔화를 입힙니다. 궁극기의 흡혈 패시브의 효과는 2.5배로 증가합니다.',
      manaCost: 100,
      cooldown: 0,
    },
  },
  'ice-mage': {
    id: 'ice-mage',
    name: 'Ice Mage',
    nameKo: '얼음 마법사',
    color: '#38bdf8',
    colorClass: 'bg-sky-400',
    maxHealth: 100,
    maxMana: 100,
    manaRegen: 6.8,
    speed: 4.8,
    attackDamage: 15,
    attackRange: 600,
    attackCooldown: 900,
    passive: '공격으로 상대방에게 결빙 효과를 입힙니다. 결빙 효과 1개당 이동속도가 10% 감소됩니다. 결빙 효과가 5개 중첩되면 1.5초간 빙결 상태가 되어 행동할 수 없게 되고, 받는 피해가 30% 증가합니다.',
    skill: {
      name: '눈사태',
      description: '대형 눈덩이를 일렬로 발사해 피해를 입히고 밀쳐냅니다.',
      manaCost: 45,
      cooldown: 5000,
    },
    ultimate: {
      name: '블리자드',
      description: '2.5초간 지속되는 눈보라를 아레나 전역에 일으켜 지속적인 피해 및 결빙 효과를 입힙니다.',
      manaCost: 100,
      cooldown: 0,
    },
  },
};

// Arena dimensions
export const ARENA = {
  width: 800,
  height: 500,
  padding: 20,
};

// Player size
export const PLAYER_SIZE = 40;

// Default game settings
export const DEFAULT_SETTINGS: GameSettings = {
  maxRounds: 3,
  roundTimeLimit: 60,
  soundEnabled: true,
  gameMode: 'multi',
};

// Create initial player state
export const createInitialPlayer = (id: 1 | 2, character: Character | null): Player => ({
  id,
  character,
  x: id === 1 ? ARENA.padding + 50 : ARENA.width - ARENA.padding - 50 - PLAYER_SIZE,
  y: ARENA.height - ARENA.padding - PLAYER_SIZE - 20, // Start on ground
  health: character?.maxHealth ?? 100,
  maxHealth: character?.maxHealth ?? 100,
  mana: character?.maxMana ?? 100,
  maxMana: character?.maxMana ?? 100,
  skillCooldownRemaining: 0,
  attackCooldownRemaining: 0,
  isAttacking: false,
  isUsingSkill: false,
  isUsingUltimate: false,
  facingRight: id === 1,
  velocityX: 0,
  velocityY: 0,
  knockbackVelocityX: 0,
  knockbackVelocityY: 0,
  // Physics
  isGrounded: true,
  lastGroundedTime: Date.now(),
  isJumping: false,
  canDoubleJump: false,
  // Status effects
  isShielding: false,
  isPoisoned: false,
  poisonDuration: 0,
  isSlowed: false,
  slowDuration: 0,
  slowAmount: 0,
  isStunned: false,
  stunDuration: 0,
  isDashing: false,
  isInvisible: false,
  invisibleDuration: 0,
  dodgesRemaining: 0,
  damageBoost: 0,
  speedBoost: 0,
  damageReduction: 0,
  buffDuration: 0,
  poisonArrowsRemaining: 0,
  rootDuration: 0,
  healthRegen: 0,
  regenDuration: 0,
  isInvulnerable: false,
  invulnerableDuration: 0,
  isFlying: false,
  trailPositions: [],
  // Ice Mage specific
  freezeGauge: 0,
  isFrozen: false,
  frozenDuration: 0,
  lastHitByIceMage: 0,
  lastFreezeGaugeDecay: 0,
  isClone: false,
  createdAt: Date.now(),
});
