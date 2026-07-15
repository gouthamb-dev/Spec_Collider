import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { groupMitigationsByRisk } from '../../src/core/mitigation-grouping.ts';
import {
  useActivityFeedStore,
  formatTimestamp,
  getContributorColor,
} from '../../src/core/activity-feed.ts';
import { arbMitigation, arbActivityEntry, arbModerationDecision } from '../generators.ts';
import type { ActivityEntry, ModerationDecision } from '../../src/types/domain.ts';

describe('Feature: spec-collider, Property 7: Mitigation grouping by Risk', () => {
  /**
   * Validates: Requirements 3.4
   *
   * For any list of Mitigations, groupMitigationsByRisk SHALL produce groups where
   * every Mitigation within a group shares the same riskId, and no two groups
   * contain the same riskId.
   */

  it('every Mitigation within a group shares the same riskId', () => {
    fc.assert(
      fc.property(
        fc.array(arbMitigation(), { minLength: 0, maxLength: 20 }),
        (mitigations) => {
          const groups = groupMitigationsByRisk(mitigations);

          for (const [riskId, groupMitigations] of groups) {
            for (const mitigation of groupMitigations) {
              expect(mitigation.riskId).toBe(riskId);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no two groups contain the same riskId', () => {
    fc.assert(
      fc.property(
        fc.array(arbMitigation(), { minLength: 0, maxLength: 20 }),
        (mitigations) => {
          const groups = groupMitigationsByRisk(mitigations);
          const riskIds = [...groups.keys()];
          const uniqueRiskIds = new Set(riskIds);

          expect(riskIds.length).toBe(uniqueRiskIds.size);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all input mitigations are present in the grouped output', () => {
    fc.assert(
      fc.property(
        fc.array(arbMitigation(), { minLength: 0, maxLength: 20 }),
        (mitigations) => {
          const groups = groupMitigationsByRisk(mitigations);
          let totalCount = 0;
          for (const groupMitigations of groups.values()) {
            totalCount += groupMitigations.length;
          }
          expect(totalCount).toBe(mitigations.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 11: Moderation decision creates correct ActivityEntry', () => {
  /**
   * Validates: Requirements 4.5
   *
   * For any ModerationDecision, the resulting ActivityEntry SHALL have
   * type='decision_made', contributor='user', and metadata containing
   * the decision action and mitigationId.
   */

  it('creates ActivityEntry with correct type, contributor, and metadata from a ModerationDecision', () => {
    fc.assert(
      fc.property(arbModerationDecision(), (decision: ModerationDecision) => {
        // Reset the store before each test
        useActivityFeedStore.getState().clearEntries();

        // Create the entry as the moderation flow would
        const entry = useActivityFeedStore.getState().createEntry(
          'decision_made',
          'user',
          `Decision: ${decision.action} on mitigation ${decision.mitigationId}`,
          {
            action: decision.action,
            mitigationId: decision.mitigationId,
          }
        );

        expect(entry.type).toBe('decision_made');
        expect(entry.contributor).toBe('user');
        expect(entry.metadata).toBeDefined();
        expect((entry.metadata as Record<string, unknown>).action).toBe(decision.action);
        expect((entry.metadata as Record<string, unknown>).mitigationId).toBe(decision.mitigationId);
      }),
      { numRuns: 100 }
    );
  });

  it('decision action is always one of accepted, rejected, or edited', () => {
    fc.assert(
      fc.property(arbModerationDecision(), (decision: ModerationDecision) => {
        const validActions = ['accepted', 'rejected', 'edited'];
        expect(validActions).toContain(decision.action);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 14: Activity Feed chronological ordering and time formatting', () => {
  /**
   * Validates: Requirements 5.1
   *
   * For any list of ActivityEntries, the feed SHALL display them in strictly
   * ascending timestamp order. For <24h timestamps, formatTimestamp SHALL produce
   * relative time; for ≥24h, SHALL produce YYYY-MM-DD HH:MM.
   */

  it('entries are sorted in strictly ascending timestamp order after adding to store', () => {
    fc.assert(
      fc.property(
        fc.array(arbActivityEntry(), { minLength: 2, maxLength: 20 }),
        (entries) => {
          // Reset the store
          useActivityFeedStore.getState().clearEntries();

          // Add entries in random order
          for (const entry of entries) {
            useActivityFeedStore.getState().addEntry(entry);
          }

          const storedEntries = useActivityFeedStore.getState().entries;

          // Verify ascending timestamp order
          for (let i = 1; i < storedEntries.length; i++) {
            expect(storedEntries[i].timestamp).toBeGreaterThanOrEqual(
              storedEntries[i - 1].timestamp
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('timestamps <24h produce relative time strings', () => {
    fc.assert(
      fc.property(
        // Generate a diff between 0 and 23h59m59s in milliseconds
        fc.integer({ min: 0, max: 24 * 60 * 60 * 1000 - 1 }),
        (diffMs) => {
          const now = Date.now();
          const timestamp = now - diffMs;
          const result = formatTimestamp(timestamp, now);

          // Should be a relative time string (not YYYY-MM-DD format)
          expect(result).not.toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
          // Should contain relative time indicators
          const isRelative =
            result === 'just now' ||
            result.includes('minute') ||
            result.includes('hour');
          expect(isRelative).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('timestamps ≥24h produce YYYY-MM-DD HH:MM format', () => {
    fc.assert(
      fc.property(
        // Generate a diff of 24h or more (up to ~365 days)
        fc.integer({ min: 24 * 60 * 60 * 1000, max: 365 * 24 * 60 * 60 * 1000 }),
        (diffMs) => {
          const now = Date.now();
          const timestamp = now - diffMs;
          const result = formatTimestamp(timestamp, now);

          // Should match YYYY-MM-DD HH:MM format
          expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 15: Contributor identity consistency', () => {
  /**
   * Validates: Requirements 5.2, 10.5
   *
   * All entries from the same contributor role SHALL map to the same color token.
   * The three roles SHALL each map to distinct colors.
   */

  it('same contributor role always maps to the same color token', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('user' as const, 'red_team_agent' as const, 'architect_agent' as const),
        (role) => {
          const color1 = getContributorColor(role);
          const color2 = getContributorColor(role);
          expect(color1).toBe(color2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('three contributor roles each map to distinct, non-overlapping color tokens', () => {
    const userColor = getContributorColor('user');
    const redTeamColor = getContributorColor('red_team_agent');
    const architectColor = getContributorColor('architect_agent');

    expect(userColor).not.toBe(redTeamColor);
    expect(userColor).not.toBe(architectColor);
    expect(redTeamColor).not.toBe(architectColor);
  });

  it('color mapping is consistent across arbitrary activity entries', () => {
    fc.assert(
      fc.property(
        fc.array(arbActivityEntry(), { minLength: 1, maxLength: 20 }),
        (entries) => {
          // For all entries with the same contributor, colors must be equal
          const colorsByContributor = new Map<string, string>();

          for (const entry of entries) {
            const color = getContributorColor(entry.contributor);
            const existing = colorsByContributor.get(entry.contributor);
            if (existing) {
              expect(color).toBe(existing);
            } else {
              colorsByContributor.set(entry.contributor, color);
            }
          }

          // All distinct contributors must have distinct colors
          const colors = [...colorsByContributor.values()];
          const uniqueColors = new Set(colors);
          expect(colors.length).toBe(uniqueColors.size);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 16: Valid entry action types', () => {
  /**
   * Validates: Requirements 5.4
   *
   * For any ActivityEntry, the type field SHALL be one of the 5 valid values:
   * 'idea_submitted', 'risk_identified', 'mitigation_proposed', 'decision_made', 'chaos_triggered'.
   */

  const VALID_ENTRY_TYPES = [
    'idea_submitted',
    'risk_identified',
    'mitigation_proposed',
    'decision_made',
    'chaos_triggered',
  ] as const;

  it('every generated ActivityEntry has a valid type', () => {
    fc.assert(
      fc.property(arbActivityEntry(), (entry: ActivityEntry) => {
        expect(VALID_ENTRY_TYPES).toContain(entry.type);
      }),
      { numRuns: 100 }
    );
  });

  it('entries added to the store maintain valid types', () => {
    fc.assert(
      fc.property(
        fc.array(arbActivityEntry(), { minLength: 1, maxLength: 20 }),
        (entries) => {
          useActivityFeedStore.getState().clearEntries();

          for (const entry of entries) {
            useActivityFeedStore.getState().addEntry(entry);
          }

          const storedEntries = useActivityFeedStore.getState().entries;
          for (const stored of storedEntries) {
            expect(VALID_ENTRY_TYPES).toContain(stored.type);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
