import type { Mitigation } from '../types/domain.ts';

/**
 * Represents a group of Mitigations that all address the same Risk.
 */
export interface MitigationGroup {
  riskId: string;
  riskTitle: string;
  mitigations: Mitigation[];
}

/**
 * Groups Mitigations by their riskId.
 * Each key in the returned Map is a riskId, and the value is the array of
 * Mitigations that share that riskId. The Map structure guarantees that no
 * two groups contain Mitigations with the same riskId.
 */
export function groupMitigationsByRisk(mitigations: Mitigation[]): Map<string, Mitigation[]> {
  const groups = new Map<string, Mitigation[]>();

  for (const mitigation of mitigations) {
    const existing = groups.get(mitigation.riskId);
    if (existing) {
      existing.push(mitigation);
    } else {
      groups.set(mitigation.riskId, [mitigation]);
    }
  }

  return groups;
}

/**
 * Returns an ordered array of MitigationGroup objects, each containing
 * the riskId, riskTitle, and all Mitigations that address that risk.
 * Groups are ordered by the earliest createdAt timestamp among their mitigations.
 */
export function getMitigationGroups(mitigations: Mitigation[]): MitigationGroup[] {
  const groupMap = groupMitigationsByRisk(mitigations);
  const groups: MitigationGroup[] = [];

  for (const [riskId, groupMitigations] of groupMap) {
    groups.push({
      riskId,
      riskTitle: groupMitigations[0].riskTitle,
      mitigations: groupMitigations,
    });
  }

  // Order groups by earliest mitigation createdAt timestamp
  groups.sort((a, b) => {
    const aEarliest = Math.min(...a.mitigations.map((m) => m.createdAt));
    const bEarliest = Math.min(...b.mitigations.map((m) => m.createdAt));
    return aEarliest - bEarliest;
  });

  return groups;
}
