import { createRoot } from 'react-dom/client';
import { useEffect, useRef } from 'react';
import '@/index.css';
import { CHARACTERS } from '@/types/game';
import { createProjectile } from '@/types/projectile';
import { emptyAIKeys } from '@/hooks/gameAI';
import { useGameEngine } from '@/hooks/useGameEngine';
import PlayerRenderer from '@/components/game/PlayerRenderer';
import ProjectileRenderer from '@/components/game/ProjectileRenderer';
import HazardRenderer from '@/components/game/HazardRenderer';
import ExplosionRenderer from '@/components/game/ExplosionRenderer';
import CharacterSelect from '@/components/game/CharacterSelect';
import GameUI from '@/components/game/GameUI';

const noRoundEnd = () => {};
export function Preview() {
  const game = useGameEngine(CHARACTERS.rocketeer, CHARACTERS.rocketeer, 60, noRoundEnd, 'single', false, 1, 'wasteland');
  const keys = useRef(emptyAIKeys());
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    keys.current.f = true; keys.current.g = true; keys.current.h = true;
    game.setKeysRef(keys);
    game.gameState.players[0].x = 180;
    game.gameState.players[1].x = 540;
  }, [game]);
  const state = game.gameState;
  const previews = [createProjectile('rocket', 1, 40, 30, 550, 0, 16),
    createProjectile('homing-rocket', 1, 150, 30, 660, 0, 16),
    { ...createProjectile('rocket', 1, 260, 30, 550, 0, 16), isNapalm: true }];
  return <main className="p-6 space-y-4">
    <h1 className="text-xl">로켓티어 · 48×32px · 빨강 / 파랑 / 네이팜</h1>
    <div className="relative h-16">{previews.map((p, i) => <ProjectileRenderer key={i} projectile={p} />)}</div>
    <GameUI players={state.players} currentRound={1} maxRounds={3} scores={[0, 0]} timeRemaining={state.roundTimeRemaining}
      isPaused={state.isPaused} onPause={game.togglePause} onReturnToMenu={noRoundEnd} />
    <div className="relative border rounded bg-slate-800 overflow-hidden" style={{ width: 800, height: 500 }}>
      {state.hazardZones.map(z => <HazardRenderer key={z.id} zone={z} />)}
      {state.projectiles.map(p => <ProjectileRenderer key={p.id} projectile={p} />)}
      {state.explosionEffects.map(e => <ExplosionRenderer key={e.id} effect={e} isPaused={state.isPaused} />)}
      {state.players.map(p => <PlayerRenderer key={p.id} player={p} character={p.character!} />)}
    </div>
  </main>;
}
const selection = new URLSearchParams(location.search).has('selection');
createRoot(document.getElementById('root')!).render(selection ? <CharacterSelect gameMode="single" onBack={noRoundEnd}
  onConfirm={noRoundEnd} initialPlayer1={CHARACTERS.rocketeer} /> : <Preview />);
