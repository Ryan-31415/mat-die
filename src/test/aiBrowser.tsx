import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CHARACTERS, type CharacterType } from '@/types/game';
import { MAPS, type MapId } from '@/types/map';
import { createHazardZone } from '@/types/projectile';
import { useGameEngine } from '@/hooks/useGameEngine';
import { emptyAIKeys } from '@/hooks/ai/controller';
import PlayerRenderer from '@/components/game/PlayerRenderer';
import ProjectileRenderer from '@/components/game/ProjectileRenderer';
import HazardRenderer from '@/components/game/HazardRenderer';
import PlatformRenderer from '@/components/game/PlatformRenderer';
import MapEffectsRenderer from '@/components/game/MapEffectsRenderer';
import '@/index.css';

// Development-only fixtures. This entry is not part of the production Vite build.
const scenarios: { id: string; label: string; map: MapId; ai: CharacterType; enemy: CharacterType }[] = [
  { id: 'corner', label: '발판 아래 구석 탈출', map: 'default', ai: 'gladiator', enemy: 'mage' },
  { id: 'wind', label: '모래바람과 벽 탈출', map: 'wasteland', ai: 'mage', enemy: 'gladiator' },
  { id: 'soul', label: '번개 회피와 영혼 회복', map: 'graveyard', ai: 'mage', enemy: 'gladiator' },
  { id: 'vine', label: '덩굴 차단과 파괴', map: 'jungle', ai: 'archer', enemy: 'gladiator' },
  { id: 'lava', label: '용암에서 발판 복귀', map: 'volcano', ai: 'gladiator', enemy: 'gladiator' },
  { id: 'shield', label: '방패 뒤로 우회 공격', map: 'wasteland', ai: 'ninja', enemy: 'gladiator' },
  { id: 'range', label: '위험 지대 너머 원거리 공격', map: 'wasteland', ai: 'mage', enemy: 'gladiator' },
];
const noRoundEnd = () => {};
export function Scenario({ scenario }: { scenario: typeof scenarios[number] }) {
  const game = useGameEngine(CHARACTERS[scenario.enemy], CHARACTERS[scenario.ai], 60, noRoundEnd, 'single', false, 1, scenario.map);
  const keys = useRef(emptyAIKeys());
  const seeded = useRef(false);
  const started = useRef(Date.now());
  const observations = useRef({ vineDestroyed: false, lightningStruck: false, behindShield: false });
  const state = game.gameState, [enemy, ai] = state.players;
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true; game.setKeysRef(keys);
    const now = Date.now(); started.current = now;
    Object.assign(state, { nextSandstormTime: Infinity, nextLightningTime: Infinity, nextSoulZoneTime: Infinity, nextVineTime: Infinity });
    ai.mana = 0;
    if (scenario.id === 'corner') {
      Object.assign(ai, { x: 740, y: 440 }); Object.assign(enemy, { x: 360, y: 210 });
    } else if (scenario.id === 'wind') {
      Object.assign(ai, { x: 740, y: 440 }); enemy.x = 380;
      Object.assign(state, { sandstormActive: true, sandstormDirection: 'right', sandstormTimer: 3000 });
    } else if (scenario.id === 'soul') {
      Object.assign(ai, { x: 440, health: 20 }); enemy.x = 100;
      state.soulZones.push({ id: 'fixture-soul', x: 550, y: 350, width: 200, height: 200, createdAt: now, duration: 10000 });
      state.lightningStrikes.push({ id: 'fixture-strike', x: 450, warningStart: now - 1000, struck: false, targetPlayerId: 2 });
    } else if (scenario.id === 'vine') {
      Object.assign(ai, { x: 580, y: 160 }); Object.assign(enemy, { x: 180, y: 160 });
      state.vineShields.push({ id: 'fixture-vine', x: 350, y: 0, width: 48, height: 340, hp: 1, createdAt: now, duration: 12000 });
    } else if (scenario.id === 'lava') {
      Object.assign(ai, { x: 730, y: 440 }); Object.assign(enemy, { x: 100, y: 320 });
    } else if (scenario.id === 'shield') {
      Object.assign(ai, { x: 520, y: 440 }); Object.assign(enemy, { x: 360, y: 440, facingRight: true }); keys.current.g = true;
    } else {
      Object.assign(ai, { x: 740, y: 440 }); enemy.x = 40;
      state.hazardZones.push({ ...createHazardZone('toxic-pool', 1, 350, 0, 10, 10000), width: 300, height: 500 });
    }
  }, [game, state, ai, enemy, scenario]);
  useEffect(() => {
    observations.current.vineDestroyed ||= state.vineShields.some(v => v.hp <= 0);
    observations.current.lightningStruck ||= state.lightningStrikes.some(s => s.struck);
    observations.current.behindShield ||= enemy.isShielding && ai.x < enemy.x - 40;
  }, [state, enemy, ai]);
  const map = MAPS[scenario.map];
  return <>
    <h2 className="text-xl font-bold">{scenario.label} · {map.nameKo}</h2>
    <p>동일한 실제 전투 엔진 · AI: {ai.character?.nameKo} · 상대: {enemy.character?.nameKo} · 경과 {((Date.now() - started.current) / 1000).toFixed(1)}초</p>
    <p>AI 위치 x={ai.x.toFixed(1)} y={ai.y.toFixed(1)} · 체력 {ai.health.toFixed(1)} · 상대 체력 {enemy.health.toFixed(1)}</p>
    <p>덩굴 피격: {observations.current.vineDestroyed ? '확인' : '대기'} · 번개 발생: {observations.current.lightningStruck ? '확인' : '대기'} · 방패 뒤 진입: {observations.current.behindShield ? '확인' : '대기'} · 원거리 유지: {state.aiState.controllers.player2?.rangedHold ? '활성' : '비활성'}</p>
    <button className="border rounded px-4 py-1 mb-2" onClick={game.togglePause}>{state.isPaused ? '계속' : '일시정지'}</button>
    <div className={`relative border-4 rounded overflow-hidden bg-gradient-to-b ${map.bgGradient}`} style={{ width: 800, height: 500, ...map.arenaStyle }}>
      {state.platforms.map(p => <PlatformRenderer key={p.id} platform={p} mapId={scenario.map} />)}
      <MapEffectsRenderer {...state} mapId={scenario.map} />
      {state.hazardZones.map(z => <HazardRenderer key={z.id} zone={z} />)}
      {state.projectiles.map(p => <ProjectileRenderer key={p.id} projectile={p} />)}
      {state.players.map(p => <PlayerRenderer key={p.id} player={p} character={p.character!} />)}
    </div>
    <p className="text-sm mt-2">고정 초기 배치로 재현하는 개발용 검증 화면입니다. 캐릭터 수치는 실제 게임과 같습니다.</p>
  </>;
}
export function AIBrowserValidation() {
  const [selected, setSelected] = useState(scenarios[0]);
  const [run, setRun] = useState(0);
  return <main className="p-6 max-w-5xl mx-auto">
    <h1 className="text-2xl font-bold mb-3">AI 브라우저 검증</h1>
    <div className="flex gap-2 flex-wrap mb-4">{scenarios.map(s => <button className="border rounded px-3 py-2" key={s.id} onClick={() => { setSelected(s); setRun(n => n + 1); }}>{s.label}</button>)}</div>
    <Scenario key={selected.id + run} scenario={selected} />
  </main>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<AIBrowserValidation />);
