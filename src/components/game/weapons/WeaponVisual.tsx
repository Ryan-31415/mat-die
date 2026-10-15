import { memo } from 'react';
import type { CharacterType, Player } from '@/types/game';
import type { BasicAttackVisual } from '@/types/combatVisual';
import { WEAPONS } from './weaponDefinitions';
import { weaponPose } from './weaponPose';

const outline = '#172033';

/** Flat color faces avoid SVG IDs entirely, including simultaneous clones. */
export const WeaponArtwork = memo(function WeaponArtwork({ id, poison = false, released = false, napalm = false }: {
  id: CharacterType; poison?: boolean; released?: boolean; napalm?: boolean;
}) {
  switch (id) {
    case 'gladiator': return <>
      <path d="M22 5 L63 5 L76 9 L63 13 L22 13 Z" fill="#b8c8d9" />
      <path d="M23 6 L64 6 L73 9 L23 9 Z" fill="#f1f5f9" stroke="none" />
      <path d="M23 9 H65" stroke="#71869b" strokeWidth="1" />
      <path d="M20 2 V16" stroke="#d8aa51" strokeWidth="4" />
      <rect x="4" y="6" width="14" height="6" rx="2" fill="#6b3d2a" />
      <path d="M8 6 V12 M12 6 V12" stroke="#bc8a59" strokeWidth="1" />
      <circle cx="3" cy="9" r="2" fill="#d8aa51" />
    </>;
    case 'ninja': return <>
      <path d="M20 7 Q50 9 76 2 Q64 11 21 11 Z" fill="#d6e3ed" />
      <path d="M22 9 Q52 11 73 4" stroke="#fff" fill="none" strokeWidth="1" />
      <path d="M19 4 V13" stroke="#b99857" strokeWidth="3" />
      <rect x="3" y="7" width="14" height="5" rx="1" fill="#303147" />
      <path d="M6 7 L9 12 M10 7 L13 12 M14 7 L16 10" stroke="#bc6476" strokeWidth="1" />
    </>;
    case 'reaper': return <>
      <path d="M9 58 L19 6" stroke={outline} strokeWidth="6" />
      <path d="M9 58 L19 6" stroke="#69564b" strokeWidth="3" />
      <path d="M18 6 Q57 -3 82 52 Q60 28 22 15 Z" fill="#52617c" />
      <path d="M22 14 Q59 24 82 52 Q66 16 42 12" fill="#c6d6e6" stroke="none" />
      <path d="M20 8 Q56 5 72 30" fill="none" stroke="#93a6c2" strokeWidth="1" />
      <path d="M16 8 L23 10 L21 18 L14 16 Z" fill="#9a8bb7" />
      <path d="M11 35 L16 36 M10 40 L15 41 M9 45 L14 46" stroke="#c2a584" strokeWidth="2" />
    </>;
    case 'archer': return <>
      <path d="M25 3 Q44 24 25 45 L29 40 Q36 24 29 8 Z" fill="#aa723e" />
      <path d="M25 3 L25 45" stroke="#e6c999" strokeWidth="1" />
      <path d={released ? 'M25 4 L25 24 L25 44' : 'M25 4 L5 24 L25 44'} stroke="#e2e8f0" strokeWidth="1" fill="none" />
      <rect x="29" y="20" width="5" height="9" rx="2" fill="#654736" />
      {!released && <g><path d="M3 24 H40" stroke="#d6b27b" /><path d="M39 21 L43 24 L39 27 Z" fill={poison ? '#4ade80' : '#dbe4ed'} /><path d="M4 21 L9 24 L4 27" stroke="#e3e8ec" fill="none" /></g>}
    </>;
    case 'mage': return <>
      <path d="M9 46 L21 14" stroke={outline} strokeWidth="6" /><path d="M9 46 L21 14" stroke="#764334" strokeWidth="3" />
      <path d="M17 17 L20 9 L31 9 L32 17 L25 21 Z" fill="#d4a551" />
      <path d="M18 10 L24 1 L32 9 L27 16 L21 16 Z" fill="#f97316" /><path d="M24 3 L26 13 L20 10 Z" fill="#fed7aa" stroke="none" />
    </>;
    case 'ice-mage': return <>
      <path d="M9 46 L21 14" stroke={outline} strokeWidth="6" /><path d="M9 46 L21 14" stroke="#536e99" strokeWidth="3" />
      <path d="M16 17 L18 12 L33 12 L32 18 L24 22 Z" fill="#a3b9cc" />
      <path d="M17 10 L22 0 L30 3 L35 12 L27 18 L21 15 Z" fill="#38bdf8" /><path d="M22 1 L25 15 L18 10 Z" fill="#e0f2fe" stroke="none" /><path d="M30 4 L27 15" stroke="#a5f3fc" strokeWidth="1" />
    </>;
    case 'scientist': return <>
      <path d="M8 4 H16 V12 L21 23 Q23 28 17 28 H7 Q1 28 3 23 L8 12 Z" fill="#c8efdd" fillOpacity="0.7" />
      <path d="M6 19 H18 L20 24 Q21 26 17 26 H7 Q3 26 5 23 Z" fill="#4ade80" stroke="none" />
      <rect x="7" y="1" width="10" height="5" rx="1" fill="#b58c55" /><path d="M8 13 L5 23" stroke="#f0fdfa" strokeWidth="2" /><circle cx="13" cy="22" r="2" fill="#bbf7d0" stroke="none" />
    </>;
    case 'hunter': return <>
      <path d="M2 10 L17 8 L22 13 L15 18 L2 20 Z" fill="#98643e" />
      <path d="M16 6 H47 V12 H26 L24 17 H20 V12 H16 Z" fill="#566678" />
      <path d="M22 7 H46" stroke="#d3dfe9" strokeWidth="1.5" /><rect x="28" y="12" width="12" height="4" rx="2" fill="#aa744a" />
      <path d="M22 13 Q30 22 31 14" fill="none" strokeWidth="1" /><path d="M45 5 V13" stroke={outline} strokeWidth="3" />
    </>;
    case 'hacker': return <>
      <rect x="2" y="9" width="18" height="9" rx="3" fill="#535270" /><path d="M6 3 H24 L28 7 V12 H6 Z" fill="#28394a" />
      <rect x="9" y="5" width="10" height="5" rx="1" fill="#4ade80" strokeWidth="1" /><path d="M11 6 L13 7 L11 9 M15 9 H17" stroke="#14382c" strokeWidth="1" fill="none" />
      <path d="M23 5 V10" stroke="#86efac" strokeWidth="2" /><path d="M5 13 H12 M15 14 H19" stroke="#c4b5fd" strokeWidth="1" />
    </>;
    case 'rocketeer': return <>
      <path d="M7 4 H51 V18 H7 L3 14 V8 Z" fill="#59684b" /><path d="M8 5 H50 V9 H8 Z" fill="#a2ac89" stroke="none" />
      <path d="M9 3 V19 M47 3 V19" stroke="#263629" strokeWidth="4" /><path d="M27 18 V24 H34 L37 18" fill="#494038" />
      <path d="M24 3 V0 H37 V3" fill="none" /><path d="M53 4 V18" stroke="#c9d3bc" strokeWidth="3" />
      <path d="M38 11 L42 14 L38 17 Z" fill={napalm ? '#fb923c' : '#e4c873'} strokeWidth="1" />
    </>;
  }
});

export default function WeaponVisual({ player, attack, visualTime = 0 }: {
  player: Player; attack?: BasicAttackVisual; visualTime?: number;
}) {
  const id = player.character!.id;
  const d = WEAPONS[id];
  const elapsed = attack ? visualTime - attack.startedAt : null;
  const pose = weaponPose(id, elapsed, player);
  if (id === 'reaper' && player.isFlying) return null;
  const facingRight = pose.attacking && attack ? attack.facingRight : player.facingRight;
  const opacity = player.isClone ? 0.4 : player.isInvisible ? 0.3 : player.isFlying ? 0.6 : 1;
  const poison = pose.attacking && attack ? attack.poison : player.poisonArrowsRemaining > 0;
  const focused = pose.attacking && attack ? attack.focused : player.hunterFocusedDuration > 0;
  const napalm = pose.attacking && attack ? attack.napalm : player.napalmDuration > 0;
  const color = poison && id === 'archer' ? '#4ade80' : focused && id === 'hunter' ? '#7dd3fc' : d.color;
  // Archer ultimate uses only the existing burst state, not fabricated basic attack events.
  const released = id === 'archer' && (pose.active || (player.archerBurstRemaining > 0 && player.archerBurstCooldown > 45));
  const hideScientistFlask = id === 'scientist' && (player.isChargingSkill || (pose.attacking && elapsed! >= 25 && elapsed! < 140));
  const handX = d.hand.x + pose.offsetX;
  const handY = d.hand.y + pose.offsetY + (id === 'scientist' && player.isChargingSkill ? -6 : 0);
  return <>
    {attack?.melee && pose.trailOpacity > 0 && <svg aria-hidden="true" focusable="false" className="absolute pointer-events-none"
      width={attack.melee.width} height={attack.melee.height} viewBox={`0 0 ${attack.melee.width} ${attack.melee.height}`}
      style={{ left: attack.melee.x, top: attack.melee.y, opacity: opacity * pose.trailOpacity, zIndex: 3, overflow: 'hidden' }}>
      <g transform={attack.facingRight ? undefined : `translate(${attack.melee.width} 0) scale(-1 1)`}>
        <path d={`M ${attack.melee.width * 0.55} 3 Q ${attack.melee.width * 1.1} ${attack.melee.height * 0.5} ${attack.melee.width * 0.55} ${attack.melee.height - 3}`}
          fill="none" stroke={color} strokeWidth={id === 'ninja' ? 2 : 3} strokeLinecap="round" />
      </g>
    </svg>}
    <div aria-hidden="true" className="absolute pointer-events-none" data-weapon={id}
      data-attack-sequence={pose.attacking ? attack?.attackSequence : undefined}
      style={{ left: player.x, top: player.y, width: 40, height: 40, transform: `scaleX(${facingRight ? 1 : -1})`, opacity, zIndex: 4 }}>
      {id === 'scientist' && player.isChargingSkill && <svg width="32" height="18" viewBox="0 0 32 18" style={{ position: 'absolute', left: 25, top: 30 }}>
        <path d="M2 5 H23 V12 H14 L12 17 H7 V12 H2 Z" fill="#536779" stroke={outline} strokeWidth="1.5" /><path d="M20 7 H30 V10 H20" fill="#7dd3fc" stroke={outline} /><circle cx="10" cy="8" r="2" fill="#fde047" />
      </svg>}
      <div style={{ position: 'absolute', left: handX, top: handY, transform: `rotate(${pose.angle}deg)`, transformOrigin: '0 0' }}>
        <svg width={d.width} height={d.height} viewBox={d.viewBox} focusable="false"
          style={{ position: 'absolute', left: -d.grip.x, top: -d.grip.y, overflow: 'visible' }}>
          <g stroke={outline} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
            {!hideScientistFlask && <WeaponArtwork id={id} poison={poison} released={released} napalm={napalm} />}
          </g>
          {id === 'gladiator' && player.buffDuration > 0 && <path d="M25 9 H66" stroke="#fb923c" strokeWidth="1" />}
          {pose.flash > 0 && d.muzzle && id !== 'scientist' && id !== 'archer' && <g opacity={pose.flash} transform={`translate(${d.muzzle.x} ${d.muzzle.y})`}>
            <path d="M-4 0 L0 -5 L2 -2 L7 0 L2 2 L0 5 Z" fill={color} />
            <circle r="2" fill="#fff" />
          </g>}
          {id === 'rocketeer' && pose.flash > 0 && <path d="M2 7 L-5 11 L2 15" fill="#fb923c" opacity={pose.flash * 0.6} />}
        </svg>
      </div>
    </div>
  </>;
}
