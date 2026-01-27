// Game Types and Interfaces

export type GameScreen = 'menu' | 'character-select' | 'game' | 'result';

export type CharacterType = 'gladiator' | 'archer' | 'mage' | 'ninja' | 'scientist';

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
  gladiator: {
    id: 'gladiator',
    name: 'Gladiator',
    nameKo: '검투사',
    color: '#dc2626',
    colorClass: 'bg-red-600',
    maxHealth: 120,
    maxMana: 100,
    manaRegen: 6.5, // Reduced to 60%
    speed: 4.0,
    attackDamage: 16,
    attackRange: 60,
    attackCooldown: 800,
    skill: {
      name: '방어',
      description: '스킬 버튼을 누르고 있는 동안 방패를 들어 전방의 공격을 방어. 이동속도 50% 감소.',
      manaCost: 20, // per 0.5 seconds
      cooldown: 0,
    },
    ultimate: {
      name: '분노',
      description: '5초간 공격력 35% 상승, 이동속도 30% 상승, 받는 피해 20% 감소.',
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
    maxHealth: 90,
    maxMana: 100,
    manaRegen: 6.3,
    speed: 4.1,
    attackDamage: 10,
    attackRange: 600,
    attackCooldown: 600,
    skill: {
      name: '독 화살',
      description: '독 화살 발사. 피격 시 6초간 독 부여 (지속 피해, 이동속도 감소).',
      manaCost: 20,
      cooldown: 4000,
    },
    ultimate: {
      name: '화살 폭풍',
      description: '전방으로 샷건처럼 화살 5개를 연속 2번 발사.',
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
    maxHealth: 80,
    maxMana: 100,
    manaRegen: 7.0,
    speed: 3.9,
    attackDamage: 20,
    attackRange: 560,
    attackCooldown: 1000,
    skill: {
      name: '대형 파이어볼',
      description: '상대 위치에 커다란 파이어볼 투하. 4초간 화염 영역 생성.',
      manaCost: 30,
      cooldown: 5000,
    },
    ultimate: {
      name: '유성우',
      description: '맵 전역에 파이어볼 10개를 무작위로 투하.',
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
    maxHealth: 85,
    maxMana: 100,
    manaRegen: 6.6,
    speed: 4.2, // slightly faster base speed (ninja passive)
    attackDamage: 14,
    attackRange: 55,
    attackCooldown: 1000,
    passive: '카타나로 적의 투사체를 반사 가능.',
    skill: {
      name: '질풍 돌진',
      description: '전방으로 돌진.',
      manaCost: 30,
      cooldown: 3000,
    },
    ultimate: {
      name: '그림자 은신',
      description: '4초간 은신. 공격력 50% 상승, 이동속도 45% 상승, 공격 2회 회피 가능.',
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
    maxHealth: 95,
    maxMana: 100,
    manaRegen: 6.1,
    speed: 3.8,
    attackDamage: 12,
    attackRange: 530, // Increased range (still shorter than Archer's 600)
    attackCooldown: 900,
    skill: {
      name: '전기 구체',
      description: '폭발성 전기 구체 발사. 넓은 폭발 범위, 강한 피해와 넉백, 4초간 이동속도 20% 감소. 직격 시 1초 기절.',
      manaCost: 50,
      cooldown: 6000,
    },
    ultimate: {
      name: '테슬라 코일',
      description: '제자리에 테슬라 코일 설치. 주변 적을 자동 공격. 파괴 시 강력한 폭발.',
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
export const PLAYER_SIZE = 50;

// Default game settings
export const DEFAULT_SETTINGS: GameSettings = {
  maxRounds: 3,
  roundTimeLimit: 60,
  soundEnabled: true,
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
});
