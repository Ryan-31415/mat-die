import { describe, expect, it } from 'vitest';
import { readEvaluationManifest, evaluationConditions } from '@/test/aiEvaluationRunner';

describe('bounded Archer stage-one evaluation', () => {
  it('pins distinct development and holdout panels with balanced sides and versions', () => {
    const development = readEvaluationManifest('src/test/archerStage1Development.json');
    const holdout = readEvaluationManifest('src/test/archerStage1Holdout.json');
    expect(development.seeds).not.toEqual(holdout.seeds);
    for (const manifest of [development, holdout]) {
      expect(manifest.characters).toEqual(['archer']);
      expect(manifest.opponents).toEqual(['archer', 'gladiator', 'ninja', 'reaper']);
      expect(manifest.maps).toHaveLength(5);
      expect(manifest.expectedGames).toBe(80);
      const conditions = evaluationConditions(manifest);
      expect(new Set(conditions.map(condition => condition.id)).size).toBe(80);
      for (const enemy of manifest.opponents!) for (const map of manifest.maps) {
        const group = conditions.filter(condition => condition.enemy === enemy && condition.map === map);
        expect(group.map(condition => `${condition.version}/${condition.side}`).sort()).toEqual([
          'baseline/1', 'baseline/2', 'current/1', 'current/2',
        ]);
      }
    }
  });
});
