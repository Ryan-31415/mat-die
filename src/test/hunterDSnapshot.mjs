// Single D policy snapshot plus fixed observations, never matches or CPU timing.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { relative, sep } from 'node:path';
import assert from 'node:assert/strict';
const root='docs/ai-runs/stage3-hunter-d-001',oldRoot='docs/ai-runs/stage3-hunter-diagnosis-001';
const prior=JSON.parse(readFileSync(oldRoot+'/diagnosis.json','utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const save=(name,x)=>writeFileSync(root+'/'+name+'.json',JSON.stringify(x,null,2)+'\n');
const finalizing=process.argv[2]==='finalize';
const bundleName=finalizing?'candidate-d-final':'candidate-d';
const observationName=finalizing?'fixed-observations-final':'fixed-observations';
assert(!existsSync(root+'/'+bundleName+'.cjs'),'Preserve frozen D');
const changes=['src/hooks/ai/controller.ts','src/hooks/ai/navigation.ts'];
for(const[p,h]of Object.entries(prior.sourceHashes))if(!changes.includes(p))assert.equal(sha(readFileSync(p)),h,p);
const entry=['hooks/ai/controller','hooks/ai/world','hooks/ai/difficulty','hooks/ai/perception','hooks/ai/learning','hooks/ai/directShot','hooks/ai/coilClear',
  'hooks/ai/hunter','hooks/ai/rocketeer','hooks/useGameEngine','types/game','types/map','types/ai','types/projectile','types/combatPhysics','test/aiCpuScenes']
  .map(p=>`export * from './src/${p}';`).join('\n');
async function compile(variant,contents=entry,instrument=false){
  const sources={};const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'cjs',platform:'node',external:['react'],write:false,
    plugins:[{name:'frozen-policy-diagnostic',setup(b){b.onLoad({filter:/[\\/]src[\\/].*\.tsx?$/},args=>{
      const p=relative(process.cwd(),args.path).split(sep).join('/');let text=readFileSync(p,'utf8');
      if(variant==='C'&&changes.includes(p))text=readFileSync(root+'/'+p.split('/').at(-1)+'.before.txt','utf8');
      if(variant==='A'&&p==='src/hooks/ai/navigation.ts')text=execFileSync('git',['show','13a8ad4:'+p],{encoding:'utf8'});
      sources[p]=sha(text);
      if(instrument&&p==='src/hooks/ai/rangedShots.ts')text=text.replace('      return result;',
        '      globalThis.__hunterShotProbes.push({ origin: { ...origin }, outcome: { ...result } }); return result;');
      return{contents:text,loader:p.endsWith('.tsx')?'tsx':'ts'};
    });}}]});return{code:result.outputFiles[0].text,sources};
}
const old=await compile('C'),current=await compile('D');assert.equal(sha(old.code),prior.candidateCHash);
assert.deepEqual(Object.keys(current.sources).filter(p=>current.sources[p]!==old.sources[p]).sort(),changes.sort());
const require=createRequire(import.meta.url);
function load(code){const module={exports:{}};new Function('module','exports','require',code)(module,module.exports,require);return module.exports;}
const aCode=readFileSync('docs/ai-runs/stage3-current-rules-combat-001/baseline.cjs','utf8');assert.equal(sha(aCode),prior.baselineAHash);
const apis={A:load(aCode),C:load(old.code),D:load(current.code)};
const draft=finalizing?load(readFileSync(root+'/candidate-d.cjs','utf8')):undefined;
for(const key of['CHARACTERS','MAPS','AI_PRESETS']){assert.deepEqual(apis.A[key],apis.D[key]);assert.deepEqual(apis.C[key],apis.D[key]);}
const auxEntry="export { selectGoal } from './src/hooks/ai/navigation';";
const auxiliary=Object.fromEntries(await Promise.all(['A','C','D'].map(async v=>[v,load((await compile(v,auxEntry)).code)])));
const fixture=load((await compile('D',"export { hunterDScenes } from './src/test/hunterDScenes';")).code);
const instrumented=Object.fromEntries(await Promise.all(['C','D'].map(async v=>[v,load((await compile(v,entry,true)).code)])));
const rows=[];
for(const{id,world}of fixture.hunterDScenes()){
  const observation=structuredClone(world),row={id,world};
  for(const name of['A','C','D']){
    const api=apis[name],frame=api.prepareAIFrame(world);let diagnostic,randomCalls=0;
    const settings=api.createAISettings('perfect');const options={parameters:settings.parameters,traits:api.NEUTRAL_AI_TRAITS,random:()=>{randomCalls++;return .5;}};
    const result=api.decideAI(frame,world.players[1],undefined,undefined,options,x=>diagnostic=x);
    let shots=[];
    if(instrumented[name]){
      globalThis.__hunterShotProbes=[];let count=0;
      const quiet=instrumented[name].decideAI(instrumented[name].prepareAIFrame(world),world.players[1],undefined,undefined,{...options,random:()=>{count++;return .5;}});
      assert.deepEqual(quiet,result,'Diagnostic hook must not change decisions');assert.equal(count,randomCalls);shots=globalThis.__hunterShotProbes;
    }
    const initial=api.createDifficultyRuntime(api.createDifficultySession(731));
    const runtime=api.stepDifficulty(world,settings,initial);
    if(name==='D'&&draft){
      let count=0;
      assert.deepEqual(draft.decideAI(draft.prepareAIFrame(world),world.players[1],undefined,undefined,{...options,random:()=>{count++;return .5;}}),result);
      assert.equal(count,randomCalls);
      assert.deepEqual(draft.stepDifficulty(world,settings,draft.createDifficultyRuntime(draft.createDifficultySession(731))),runtime);
    }
    row[name]={preferred:auxiliary[name].selectGoal(world.players[1],world.players[0],frame).preferred,
      decision:result,diagnostic,randomCalls,shots,runtime};
  }
  assert.deepEqual(row.D.diagnostic.movementCandidates,row.A.diagnostic.movementCandidates,id);
  assert.deepEqual(row.D.diagnostic.goal,row.A.diagnostic.goal,id);
  assert.deepEqual(row.D.diagnostic.executed.action,row.A.diagnostic.executed.action,id);
  assert.deepEqual(world,observation);rows.push(row);
}
const registered=finalizing?JSON.parse(readFileSync(root+'/fixed-observations.json','utf8')).proposedEvaluation:undefined;
const bytes=registered?undefined:randomBytes(8),developmentSeed=registered?.developmentSeed??bytes.readUInt32LE(0),holdoutSeed=registered?.holdoutSeed??bytes.readUInt32LE(4);
assert(![2387916401,1573068927,589941701,3909090742,developmentSeed].includes(holdoutSeed));
assert(![2387916401,1573068927,589941701,3909090742].includes(developmentSeed));
const sourceHashes=Object.fromEntries(Object.keys(prior.sourceHashes).map(p=>[p,sha(readFileSync(p))]));
writeFileSync(root+'/'+bundleName+'.cjs',current.code);
save(bundleName+'.cjs',{schemaVersion:1,bundleSha256:sha(current.code),sources:sourceHashes});
save(observationName,{head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baselineAHash:prior.baselineAHash,candidateCHash:prior.candidateCHash,
  candidateDHash:sha(current.code),sourceChanges:changes,sourceHashes,newCombatGames:0,newCpuBenchmarks:0,policyCandidates:1,
  ...(finalizing?{draftHash:sha(readFileSync(root+'/candidate-d.cjs')),draftRuntimeEqualityChecks:24,finalization:'Remove unreachable Hunter comparison in Rocketeer-only movement block; no policy tuning'}:{}),
  diagnosticToolHashes:Object.fromEntries(['src/test/hunterDSnapshot.mjs','src/test/hunterDScenes.ts','src/hooks/ai/hunterD.test.ts','src/hooks/ai/hunterReload.test.ts'].map(p=>[p,sha(readFileSync(p))])),
  methodology:'Same fixed public state, neutral-trait direct decisions and independent seed-731 perfect-difficulty runtimes. A/C/D preferred spacing from source-matched navigation auxiliaries. Shot diagnostic instrumentation proved identical decision and random-call count.',rows,
  proposedEvaluation:{requiresUserApproval:true,developmentSeed,holdoutSeed,matchups:[['hunter','hunter']],maps:['default','wasteland','graveyard','jungle','volcano'],
    evaluatedVersions:['A','D'],frozenOpponent:'A',sides:[1,2],preset:'perfect',roundSeconds:60,gamesPerPanel:20,maxGames:40,maxWorkerMs:600000}});
console.log(JSON.stringify({candidateDHash:sha(current.code),sourceChanges:changes,scenes:rows.length,seeds:{developmentSeed,holdoutSeed},
  comparison:rows.map(r=>({id:r.id,A:{preferred:r.A.preferred,...r.A.diagnostic.executed},C:{preferred:r.C.preferred,...r.C.diagnostic.executed},D:{preferred:r.D.preferred,...r.D.diagnostic.executed,work:r.D.diagnostic.rangedWork}}))},null,2));
