import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ModerationService, determineMitigationTargetSection } from '../../src/core/moderation.ts';
import type { SpecDraftSection } from '../../src/core/moderation.ts';
import { arbMitigation, arbSpecDraft, arbInputText } from '../generators.ts';
import type { Mitigation } from '../../src/types/domain.ts';

/**
 * Helper: generates a Mitigation that deterministically targets a specific SpecDraft section.
 * Uses keyword injection in the description to steer the heuristic.
 */
function arbMitigationForSection(section: SpecDraftSection): fc.Arbitrary<Mitigation> {
  const keywords: Record<SpecDraftSection, string> = {
    apiSurface: 'api endpoint',
    dataModel: 'database schema',
    proposedArchitecture: 'architecture component',
    assumptions: 'assumption constraint',
    overview: 'general overview topic',
  };

  return fc.record({
    id: fc.uuid(),
    riskId: fc.uuid(),
    riskTitle: fc.constant('Risk for ' + section),
    responseType: fc.constantFrom('fix', 'trade_off', 'accepted_risk') as fc.Arbitrary<Mitigation['responseType']>,
    description: fc.string({ minLength: 1, maxLength: 500 }).map((s) => keywords[section] + ' ' + s),
    technologies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
    tradeOffs: fc.array(fc.string({ minLength: 1, maxLength: 200 }), { maxLength: 3 }),
    mcpEvidence: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
    createdAt: fc.nat(),
  });
}

describe('Feature: spec-collider, Property 8: Accept state transition', () => {
  /**
   * Validates: Requirements 4.2
   *
   * For any valid Mitigation and current SpecDraft, accepting the Mitigation SHALL
   * produce a new SpecDraft with the proposed change applied AND add a ModerationDecision
   * with action='accepted', correct mitigationId, and timestamp.
   */

  it('accepting a mitigation applies its description to the targeted section', async () => {
    await fc.assert(
      fc.asyncProperty(arbSpecDraft(), arbMitigation(), async (specDraft, mitigation) => {
        const service = new ModerationService(specDraft, [mitigation]);
        const targetSection = determineMitigationTargetSection(mitigation);

        const updatedDraft = await service.accept(mitigation.id);

        // The targeted section should now contain the mitigation's description
        expect(updatedDraft[targetSection]).toBe(mitigation.description);
      }),
      { numRuns: 100 }
    );
  });

  it('accepting a mitigation records a decision with action=accepted and correct mitigationId', async () => {
    await fc.assert(
      fc.asyncProperty(arbSpecDraft(), arbMitigation(), async (specDraft, mitigation) => {
        const service = new ModerationService(specDraft, [mitigation]);

        await service.accept(mitigation.id);

        const decisions = service.getDecisions();
        expect(decisions.length).toBe(1);

        const decision = decisions[0];
        expect(decision.action).toBe('accepted');
        expect(decision.mitigationId).toBe(mitigation.id);
        expect(decision.timestamp).toBeGreaterThan(0);
        expect(decision.id).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('accepting a mitigation increments the SpecDraft version', async () => {
    await fc.assert(
      fc.asyncProperty(arbSpecDraft(), arbMitigation(), async (specDraft, mitigation) => {
        const service = new ModerationService(specDraft, [mitigation]);
        const originalVersion = specDraft.version;

        const updatedDraft = await service.accept(mitigation.id);

        expect(updatedDraft.version).toBe(originalVersion + 1);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 9: Reject validation and state preservation', () => {
  /**
   * Validates: Requirements 4.3
   *
   * For any valid rejection (1-1000 chars), the SpecDraft SHALL remain unchanged;
   * for invalid, SHALL be prevented.
   */

  it('valid rejection (1-1000 chars) preserves the SpecDraft unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSpecDraft(),
        arbMitigation(),
        arbInputText(1, 1000),
        async (specDraft, mitigation, reason) => {
          const service = new ModerationService(specDraft, [mitigation]);
          const draftBefore = service.getSpecDraft();

          await service.reject(mitigation.id, reason);

          const draftAfter = service.getSpecDraft();
          // SpecDraft should remain unchanged after rejection
          expect(draftAfter.overview).toBe(draftBefore.overview);
          expect(draftAfter.proposedArchitecture).toBe(draftBefore.proposedArchitecture);
          expect(draftAfter.dataModel).toBe(draftBefore.dataModel);
          expect(draftAfter.apiSurface).toBe(draftBefore.apiSurface);
          expect(draftAfter.assumptions).toBe(draftBefore.assumptions);
          expect(draftAfter.version).toBe(draftBefore.version);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('invalid rejection (empty or >1000 chars) is prevented with an error', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSpecDraft(),
        arbMitigation(),
        fc.oneof(fc.constant(''), arbInputText(1001, 2000)),
        async (specDraft, mitigation, reason) => {
          const service = new ModerationService(specDraft, [mitigation]);
          const draftBefore = service.getSpecDraft();

          await expect(service.reject(mitigation.id, reason)).rejects.toThrow();

          // SpecDraft should remain unchanged
          const draftAfter = service.getSpecDraft();
          expect(draftAfter.overview).toBe(draftBefore.overview);
          expect(draftAfter.proposedArchitecture).toBe(draftBefore.proposedArchitecture);
          expect(draftAfter.dataModel).toBe(draftBefore.dataModel);
          expect(draftAfter.apiSurface).toBe(draftBefore.apiSurface);
          expect(draftAfter.assumptions).toBe(draftBefore.assumptions);
          expect(draftAfter.version).toBe(draftBefore.version);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('valid rejection records a decision with action=rejected and correct reason', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSpecDraft(),
        arbMitigation(),
        arbInputText(1, 1000),
        async (specDraft, mitigation, reason) => {
          const service = new ModerationService(specDraft, [mitigation]);

          await service.reject(mitigation.id, reason);

          const decisions = service.getDecisions();
          expect(decisions.length).toBe(1);
          expect(decisions[0].action).toBe('rejected');
          expect(decisions[0].mitigationId).toBe(mitigation.id);
          expect(decisions[0].reason).toBe(reason);
          expect(decisions[0].timestamp).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 10: Edit validation and application', () => {
  /**
   * Validates: Requirements 4.4
   *
   * For any valid edit text (1-5000 chars) the edited text SHALL be applied;
   * for >5000, SHALL be rejected.
   */

  it('valid edit text (1-5000 chars) is applied to the targeted SpecDraft section', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSpecDraft(),
        arbMitigation(),
        arbInputText(1, 5000),
        async (specDraft, mitigation, editText) => {
          const service = new ModerationService(specDraft, [mitigation]);
          const targetSection = determineMitigationTargetSection(mitigation);

          const updatedDraft = await service.edit(mitigation.id, editText);

          expect(updatedDraft[targetSection]).toBe(editText);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('invalid edit text (>5000 chars) is rejected with an error', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSpecDraft(),
        arbMitigation(),
        arbInputText(5001, 6000),
        async (specDraft, mitigation, editText) => {
          const service = new ModerationService(specDraft, [mitigation]);
          const draftBefore = service.getSpecDraft();

          await expect(service.edit(mitigation.id, editText)).rejects.toThrow();

          // SpecDraft should remain unchanged on invalid edit
          const draftAfter = service.getSpecDraft();
          expect(draftAfter.overview).toBe(draftBefore.overview);
          expect(draftAfter.proposedArchitecture).toBe(draftBefore.proposedArchitecture);
          expect(draftAfter.dataModel).toBe(draftBefore.dataModel);
          expect(draftAfter.apiSurface).toBe(draftBefore.apiSurface);
          expect(draftAfter.assumptions).toBe(draftBefore.assumptions);
          expect(draftAfter.version).toBe(draftBefore.version);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('valid edit records a decision with action=edited and the modified text', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSpecDraft(),
        arbMitigation(),
        arbInputText(1, 5000),
        async (specDraft, mitigation, editText) => {
          const service = new ModerationService(specDraft, [mitigation]);

          await service.edit(mitigation.id, editText);

          const decisions = service.getDecisions();
          expect(decisions.length).toBe(1);
          expect(decisions[0].action).toBe('edited');
          expect(decisions[0].mitigationId).toBe(mitigation.id);
          expect(decisions[0].modifiedText).toBe(editText);
          expect(decisions[0].timestamp).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 12: Cancel preserves state', () => {
  /**
   * Validates: Requirements 4.6
   *
   * For any SpecDraft state and in-progress operation, canceling SHALL result in
   * SpecDraft being identical to its state before the operation and controls
   * returning to initial state.
   */

  it('canceling a pending edit preserves SpecDraft and clears pending state', () => {
    fc.assert(
      fc.property(
        arbSpecDraft(),
        arbMitigation(),
        arbInputText(1, 5000),
        (specDraft, mitigation, editText) => {
          const service = new ModerationService(specDraft, [mitigation]);
          const draftBefore = service.getSpecDraft();

          // Simulate starting an edit (pending state)
          service.setPendingEdit(mitigation.id, editText);
          expect(service.getPendingEdit()).not.toBeNull();

          // Cancel the operation
          service.cancel();

          // Verify SpecDraft is unchanged
          const draftAfter = service.getSpecDraft();
          expect(draftAfter.overview).toBe(draftBefore.overview);
          expect(draftAfter.proposedArchitecture).toBe(draftBefore.proposedArchitecture);
          expect(draftAfter.dataModel).toBe(draftBefore.dataModel);
          expect(draftAfter.apiSurface).toBe(draftBefore.apiSurface);
          expect(draftAfter.assumptions).toBe(draftBefore.assumptions);
          expect(draftAfter.version).toBe(draftBefore.version);
          expect(draftAfter.lastModified).toBe(draftBefore.lastModified);

          // Verify controls returned to initial state (no pending edit)
          expect(service.getPendingEdit()).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('canceling without any pending operation leaves SpecDraft untouched', () => {
    fc.assert(
      fc.property(arbSpecDraft(), arbMitigation(), (specDraft, mitigation) => {
        const service = new ModerationService(specDraft, [mitigation]);
        const draftBefore = service.getSpecDraft();

        // Cancel with no pending operation
        service.cancel();

        const draftAfter = service.getSpecDraft();
        expect(draftAfter.overview).toBe(draftBefore.overview);
        expect(draftAfter.proposedArchitecture).toBe(draftBefore.proposedArchitecture);
        expect(draftAfter.dataModel).toBe(draftBefore.dataModel);
        expect(draftAfter.apiSurface).toBe(draftBefore.apiSurface);
        expect(draftAfter.assumptions).toBe(draftBefore.assumptions);
        expect(draftAfter.version).toBe(draftBefore.version);
        expect(draftAfter.lastModified).toBe(draftBefore.lastModified);
        expect(service.getPendingEdit()).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('cancel after multiple pending edits still preserves original state', () => {
    fc.assert(
      fc.property(
        arbSpecDraft(),
        arbMitigation(),
        arbInputText(1, 5000),
        arbInputText(1, 5000),
        (specDraft, mitigation, editText1, editText2) => {
          const service = new ModerationService(specDraft, [mitigation]);
          const draftBefore = service.getSpecDraft();

          // Set pending edit, then override with another
          service.setPendingEdit(mitigation.id, editText1);
          service.setPendingEdit(mitigation.id, editText2);

          // Cancel
          service.cancel();

          // SpecDraft should be unchanged from original
          const draftAfter = service.getSpecDraft();
          expect(draftAfter.overview).toBe(draftBefore.overview);
          expect(draftAfter.proposedArchitecture).toBe(draftBefore.proposedArchitecture);
          expect(draftAfter.dataModel).toBe(draftBefore.dataModel);
          expect(draftAfter.apiSurface).toBe(draftBefore.apiSurface);
          expect(draftAfter.assumptions).toBe(draftBefore.assumptions);
          expect(draftAfter.version).toBe(draftBefore.version);
          expect(service.getPendingEdit()).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 13: Conflict detection', () => {
  /**
   * Validates: Requirements 4.7
   *
   * For any two Mitigations that reference the same SpecDraft section, if the first
   * is accepted, attempting to accept the second SHALL produce hasConflict=true.
   */

  it('detects conflict when two mitigations target the same section and the first is accepted', async () => {
    // Use deterministic section targeting to ensure both mitigations target the same section
    const sections: SpecDraftSection[] = ['overview', 'proposedArchitecture', 'dataModel', 'apiSurface', 'assumptions'];

    await fc.assert(
      fc.asyncProperty(
        arbSpecDraft(),
        fc.constantFrom(...sections).chain((section) =>
          fc.tuple(arbMitigationForSection(section), arbMitigationForSection(section))
            .filter(([m1, m2]) => m1.id !== m2.id)
        ),
        async (specDraft, [mitigation1, mitigation2]) => {
          const service = new ModerationService(specDraft, [mitigation1, mitigation2]);

          // Accept the first mitigation
          await service.accept(mitigation1.id);

          // Check conflict for the second mitigation
          const conflict = service.checkConflict(mitigation2.id, service.getSpecDraft());
          expect(conflict.hasConflict).toBe(true);
          expect(conflict.conflictingDecision).toBeDefined();
          expect(conflict.conflictingDecision!.mitigationId).toBe(mitigation1.id);
          expect(conflict.affectedSection).toBe(determineMitigationTargetSection(mitigation2));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no conflict when mitigations target different sections', async () => {
    // Use two sections that are deterministically different
    await fc.assert(
      fc.asyncProperty(
        arbSpecDraft(),
        fc.tuple(
          arbMitigationForSection('apiSurface'),
          arbMitigationForSection('assumptions')
        ).filter(([m1, m2]) => m1.id !== m2.id),
        async (specDraft, [mitigation1, mitigation2]) => {
          const service = new ModerationService(specDraft, [mitigation1, mitigation2]);

          // Accept the first mitigation (targets apiSurface)
          await service.accept(mitigation1.id);

          // Check conflict for the second (targets assumptions) — should not conflict
          const conflict = service.checkConflict(mitigation2.id, service.getSpecDraft());
          expect(conflict.hasConflict).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no conflict when no prior decisions exist', () => {
    fc.assert(
      fc.property(arbSpecDraft(), arbMitigation(), (specDraft, mitigation) => {
        const service = new ModerationService(specDraft, [mitigation]);

        // Check conflict with no prior decisions
        const conflict = service.checkConflict(mitigation.id, specDraft);
        expect(conflict.hasConflict).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
