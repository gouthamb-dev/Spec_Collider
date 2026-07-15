import { describe, it, expect } from 'vitest';
import {
  groupMitigationsByRisk,
  getMitigationGroups,
} from '../../src/core/mitigation-grouping.ts';
import type { Mitigation } from '../../src/types/domain.ts';

function makeMitigation(overrides: Partial<Mitigation> = {}): Mitigation {
  return {
    id: `mit-${Math.random().toString(36).slice(2)}`,
    riskId: 'risk-1',
    riskTitle: 'Default Risk',
    responseType: 'fix',
    description: 'A mitigation description',
    technologies: ['TypeScript'],
    tradeOffs: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('groupMitigationsByRisk', () => {
  it('returns an empty map for an empty array', () => {
    const result = groupMitigationsByRisk([]);
    expect(result.size).toBe(0);
  });

  it('groups a single mitigation under its riskId', () => {
    const mit = makeMitigation({ riskId: 'risk-A' });
    const result = groupMitigationsByRisk([mit]);

    expect(result.size).toBe(1);
    expect(result.get('risk-A')).toEqual([mit]);
  });

  it('groups multiple mitigations with the same riskId together', () => {
    const mit1 = makeMitigation({ id: 'mit-1', riskId: 'risk-X', createdAt: 100 });
    const mit2 = makeMitigation({ id: 'mit-2', riskId: 'risk-X', createdAt: 200 });
    const mit3 = makeMitigation({ id: 'mit-3', riskId: 'risk-X', createdAt: 300 });

    const result = groupMitigationsByRisk([mit1, mit2, mit3]);

    expect(result.size).toBe(1);
    expect(result.get('risk-X')).toHaveLength(3);
    expect(result.get('risk-X')).toContain(mit1);
    expect(result.get('risk-X')).toContain(mit2);
    expect(result.get('risk-X')).toContain(mit3);
  });

  it('creates separate groups for different riskIds', () => {
    const mitA = makeMitigation({ id: 'mit-a', riskId: 'risk-A' });
    const mitB = makeMitigation({ id: 'mit-b', riskId: 'risk-B' });
    const mitC = makeMitigation({ id: 'mit-c', riskId: 'risk-C' });

    const result = groupMitigationsByRisk([mitA, mitB, mitC]);

    expect(result.size).toBe(3);
    expect(result.get('risk-A')).toEqual([mitA]);
    expect(result.get('risk-B')).toEqual([mitB]);
    expect(result.get('risk-C')).toEqual([mitC]);
  });

  it('ensures no riskId spans multiple groups', () => {
    const mitigations = [
      makeMitigation({ riskId: 'risk-1' }),
      makeMitigation({ riskId: 'risk-2' }),
      makeMitigation({ riskId: 'risk-1' }),
      makeMitigation({ riskId: 'risk-3' }),
      makeMitigation({ riskId: 'risk-2' }),
    ];

    const result = groupMitigationsByRisk(mitigations);

    // Each riskId should appear as exactly one key
    expect(result.size).toBe(3);
    expect(result.get('risk-1')).toHaveLength(2);
    expect(result.get('risk-2')).toHaveLength(2);
    expect(result.get('risk-3')).toHaveLength(1);
  });

  it('every mitigation within a group shares the same riskId', () => {
    const mitigations = [
      makeMitigation({ riskId: 'risk-A' }),
      makeMitigation({ riskId: 'risk-B' }),
      makeMitigation({ riskId: 'risk-A' }),
      makeMitigation({ riskId: 'risk-B' }),
    ];

    const result = groupMitigationsByRisk(mitigations);

    for (const [riskId, group] of result) {
      for (const mit of group) {
        expect(mit.riskId).toBe(riskId);
      }
    }
  });
});

describe('getMitigationGroups', () => {
  it('returns an empty array for empty input', () => {
    const result = getMitigationGroups([]);
    expect(result).toEqual([]);
  });

  it('returns a single group for mitigations with the same riskId', () => {
    const mitigations = [
      makeMitigation({ riskId: 'risk-1', riskTitle: 'SQL Injection', createdAt: 100 }),
      makeMitigation({ riskId: 'risk-1', riskTitle: 'SQL Injection', createdAt: 200 }),
    ];

    const result = getMitigationGroups(mitigations);

    expect(result).toHaveLength(1);
    expect(result[0].riskId).toBe('risk-1');
    expect(result[0].riskTitle).toBe('SQL Injection');
    expect(result[0].mitigations).toHaveLength(2);
  });

  it('returns groups ordered by earliest createdAt timestamp', () => {
    const mitigations = [
      makeMitigation({ riskId: 'risk-B', riskTitle: 'Risk B', createdAt: 500 }),
      makeMitigation({ riskId: 'risk-A', riskTitle: 'Risk A', createdAt: 100 }),
      makeMitigation({ riskId: 'risk-C', riskTitle: 'Risk C', createdAt: 300 }),
      makeMitigation({ riskId: 'risk-A', riskTitle: 'Risk A', createdAt: 600 }),
    ];

    const result = getMitigationGroups(mitigations);

    expect(result).toHaveLength(3);
    expect(result[0].riskId).toBe('risk-A'); // earliest: 100
    expect(result[1].riskId).toBe('risk-C'); // earliest: 300
    expect(result[2].riskId).toBe('risk-B'); // earliest: 500
  });

  it('includes correct riskTitle from the first mitigation in each group', () => {
    const mitigations = [
      makeMitigation({ riskId: 'risk-1', riskTitle: 'Data Loss', createdAt: 10 }),
      makeMitigation({ riskId: 'risk-1', riskTitle: 'Data Loss', createdAt: 20 }),
      makeMitigation({ riskId: 'risk-2', riskTitle: 'Auth Bypass', createdAt: 30 }),
    ];

    const result = getMitigationGroups(mitigations);

    expect(result[0].riskTitle).toBe('Data Loss');
    expect(result[1].riskTitle).toBe('Auth Bypass');
  });

  it('preserves all mitigations across groups (no data loss)', () => {
    const mitigations = [
      makeMitigation({ id: 'a', riskId: 'risk-1', createdAt: 1 }),
      makeMitigation({ id: 'b', riskId: 'risk-2', createdAt: 2 }),
      makeMitigation({ id: 'c', riskId: 'risk-1', createdAt: 3 }),
      makeMitigation({ id: 'd', riskId: 'risk-3', createdAt: 4 }),
      makeMitigation({ id: 'e', riskId: 'risk-2', createdAt: 5 }),
    ];

    const result = getMitigationGroups(mitigations);

    const allMitigationIds = result.flatMap((g) => g.mitigations.map((m) => m.id));
    expect(allMitigationIds.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('each group has MitigationGroup interface shape', () => {
    const mitigations = [
      makeMitigation({ riskId: 'risk-1', riskTitle: 'Perf Issue', createdAt: 100 }),
    ];

    const result = getMitigationGroups(mitigations);

    expect(result[0]).toHaveProperty('riskId');
    expect(result[0]).toHaveProperty('riskTitle');
    expect(result[0]).toHaveProperty('mitigations');
    expect(Array.isArray(result[0].mitigations)).toBe(true);
  });
});
