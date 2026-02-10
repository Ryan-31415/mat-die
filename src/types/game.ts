// Game Types and Interfaces

export type GameScreen = 'menu' | 'character-select' | 'map-select' | 'game' | 'result';

export type CharacterType = 'gladiator' | 'archer' | 'mage' | 'ninja' | 'scientist' | 'hunter' | 'reaper' | 'ice-mage' | 'hacker';

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
  // Archer specific
  archerBuffStacks?: number;
  // Ice Mage specific
  freezeGauge: number;
  isFrozen: boolean;
  frozenDuration: number;
  lastHitByIceMage: number;
  lastFreezeGaugeDecay: number;
  // Mage specific
  isBurning: boolean;
  burnDuration: number;
  burnDamagePerTick: number;
  burnOwner: 1 | 2 | null;
  lastBurnTick: number;
  mageUltimateDuration: number;
  isClone: boolean;
  createdAt: number;
  // Scientist specific
  skillChargeStartTime?: number;
  isChargingSkill?: boolean;
  // Hunter specific
  isMarked?: boolean;
  markDuration?: number;
  markOwnerId?: 1 | 2;
  hunterFocusedDuration?: number;
  isEvading: boolean;
  evadeDuration: number;
  // Hacker specific
  isSilenced: boolean;
  silenceDuration: number;
  isHacked: boolean; // System Override effect (control inversion, damage reduction)
  hackedDuration: number;
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
    manaRegen: 6.6, // Reduced to 60%
    speed: 5.0,
    attackDamage: 16,
    attackRange: 80,
    attackCooldown: 800,
    skill: {
      name: '방어',
      description: '스킬 버튼을 누르고 있는 동안 방패를 들어 전방의 공격을 반사합니다. 방패를 드는 동안 이동속도가 50% 감소합니다.',
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
    attackDamage: 16,
    attackRange: 600,
    attackCooldown: 600,
    passive: '장거리 공격 시 데미지가 15% 상승합니다.',
    skill: {
      name: '독화살',
      description: '다음 3발의 기본 공격을 독 화살로 강화합니다. 피격 시 5초간 독 효과(이동속도 33% 감소, 지속 피해)를 부여합니다.',
      manaCost: 45,
      cooldown: 5000,
    },
    ultimate: {
      name: '명사수',
      description: '4초간 발사하는 화살이 유도되고, 공격력이 25% 상승하고, 공격속도가 15% 상승합니다. 이 상태에서 적을 명중시킬 때마다 효과가 강화되고 지속 시간이 길어집니다. 최대 5번까지 강화 가능합니다.',
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
    maxHealth: 90,
    maxMana: 100,
    manaRegen: 6.8,
    speed: 4.9,
    attackDamage: 18,
    attackRange: 600,
    attackCooldown: 1000,
    skill: {
      name: '대형 파이어볼',
      description: '상대 위치에 커다란 파이어볼을 투하합니다. 명중 시 파이어볼 5개가 추가적으로 투하됩니다.',
      manaCost: 40,
      cooldown: 3500,
    },
    ultimate: {
      name: '각성',
      description: '5초간 공격력이 30%, 마나 재생력이 50% 상승하며, 모든 공격이 3초간 발화 효과를 부여합니다. 주변에 화염 고리가 형성되어 적에게 피해를 입힙니다.',
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
    manaRegen: 6.5,
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
      description: '4초간 은신해서 이동속도가 40% 상승하고, 공격력이 25% 상승합니다. 은신 시 1회 한정으로 공격을 회피 가능합니다.',
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
      description: '스킬 버튼을 길게 눌러 에너지를 충전합니다. 충전 시간에 비례해 전기 구체의 화력이 증가합니다. 완충 시 피격된 적을 기절시킵니다. 과도하게 충전하면 자폭으로 데미지를 받습니다.',
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
      name: '그물 투척',
      description: '투척형 그물을 던져 적중 시 적을 플레이어 쪽으로 약간 끌어오고, 6초간 표식을 부여합니다. 표식 대상은 사냥꾼에게 받는 피해가 20% 증가하며, 피격 시 0.7초간 이동속도가 15% 감소합니다.',
      manaCost: 40,
      cooldown: 4000,
    },
    ultimate: {
      name: '집중 사격',
      description: '5초간 기본 공격의 탄환 수가 5발에서 7발로 증가하고, 집탄률, 사거리, 탄속이 향상됩니다.',
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
      description: '2.5초간 무적 상태로 비행하며 접촉한 적에게 지속 피해와 둔화를 입힙니다. 궁극기의 흡혈 패시브는 50% 증가되어 적용됩니다.',
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
    maxHealth: 95,
    maxMana: 100,
    manaRegen: 6.8,
    speed: 4.8,
    attackDamage: 15,
    attackRange: 600,
    attackCooldown: 900,
    passive: '공격으로 상대방에게 결빙 효과를 입힙니다. 결빙 효과 1개당 이동속도가 10% 감소됩니다. 결빙 효과가 5개 중첩되면 1.2초간 빙결 상태가 되어 행동할 수 없게 되고, 공격을 받으면 10%의 추가 피해를 입고 빙결이 해제됩니다.',
    skill: {
      name: '눈사태',
      description: '대형 눈덩이를 일렬로 발사해 피해를 입히고 밀쳐냅니다.',
      manaCost: 45,
      cooldown: 5000,
    },
    ultimate: {
      name: '눈보라',
      description: '거대한 얼음 덩어리를 던져 특정 지역에 눈보라를 일으킵니다. 영역 내 적은 미끄러지며, 둔화 및 빙결 효과가 강화되고 넉백을 더 크게 받습니다. 눈보라를 처음 발생시킬 때 범위 내 적을 0.5초간 빙결시킵니다.',
      manaCost: 100,
      cooldown: 0,
    },
  },
  hacker: {
    id: 'hacker',
    name: 'Hacker',
    nameKo: '해커',
    color: '#84cc16', // lime-500
    colorClass: 'bg-lime-500',
    maxHealth: 85,
    maxMana: 100,
    manaRegen: 6.6,
    speed: 4.7,
    attackDamage: 12,
    attackRange: 550, // Ranged character similar to others
    attackCooldown: 900, // Standard ranged cooldown
    skill: {
      name: '백도어',
      description: '전방에 5초간 지속되는 사각형 영역을 설치합니다. 영역에 닿은 적은 스킬/궁극기 사용이 봉인됩니다. 해커가 이 영역 안에서 적을 공격하면 데미지가 25% 증가하고 적과 위치를 바꿉니다.',
      manaCost: 35,
      cooldown: 5000,
    },
    ultimate: {
      name: '시스템 오버라이드',
      description: '4초간 상대방을 해킹하여 공격력을 20% 감소시키고 이동 조작을 반전시킵니다.',
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
  // Mage specific
  isBurning: false,
  burnDuration: 0,
  burnDamagePerTick: 0,
  burnOwner: null,
  lastBurnTick: 0,
  mageUltimateDuration: 0,
  isClone: false,
  createdAt: Date.now(),
  skillChargeStartTime: undefined,
  isChargingSkill: false,
  isMarked: false,
  markDuration: 0,
  markOwnerId: undefined,
  hunterFocusedDuration: 0,
  isEvading: false,
  evadeDuration: 0,
  isSilenced: false,
  silenceDuration: 0,
  isHacked: false,
  hackedDuration: 0,
});
