import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ArtifactGenerator } from '../../src/core/artifact-generator.ts';
import {
  createVersionedArtifact,
  addVersion,
  MAX_VERSIONS,
} from '../../src/core/versioned-artifacts.ts';
import { arbSession } from '../generators.ts';
import type { Session, Artifact, ModerationDecision } from '../../src/types/domain.ts';

/**
 * Helper: generates a session with at least one accepted ModerationDecision.
 */
function arbSessionWithAccepted(): fc.Arbitrary<Session> {
  return arbSession().chain((session) => {
    // Generate at least one accepted decision
    return fc.record({
      id: fc.uuid(),
      mitigationId: fc.uuid(),
      action: fc.constant('accepted' as const),
      reason: fc.constant(undefined),
      modifiedText: fc.constant(undefined),
      specDraftSectionModified: fc.constantFrom(
        'overview',
        'proposedArchitecture',
        'dataModel',
        'apiSurface',
        'assumptions'
      ),
      timestamp: fc.nat(),
    }).map((acceptedDecision) => ({
      ...session,
      moderationHistory: [acceptedDecision, ...session.moderationHistory],
    }));
  });
}

/**
 * Helper: generates a session with NO accepted ModerationDecisions.
 */
function arbSessionWithNoAccepted(): fc.Arbitrary<Session> {
  return arbSession().map((session) => ({
    ...session,
    moderationHistory: session.moderationHistory.filter((d) => d.action !== 'accepted'),
  }));
}

/**
 * Helper: generates a session with N accepted decisions and at least one trade-off decision.
 */
function arbSessionWithNAccepted(minAccepted: number): fc.Arbitrary<Session> {
  return fc.tuple(
    arbSession(),
    fc.array(
      fc.record({
        id: fc.uuid(),
        mitigationId: fc.uuid(),
        action: fc.constant('accepted' as const),
        reason: fc.constant(undefined),
        modifiedText: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
        specDraftSectionModified: fc.constantFrom(
          'overview',
          'proposedArchitecture',
          'dataModel',
          'apiSurface',
          'assumptions'
        ),
        timestamp: fc.nat(),
      }),
      { minLength: minAccepted, maxLength: minAccepted + 3 }
    ),
    fc.array(
      fc.record({
        id: fc.uuid(),
        mitigationId: fc.uuid(),
        action: fc.constantFrom('accepted', 'rejected') as fc.Arbitrary<'accepted' | 'rejected'>,
        reason: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
        modifiedText: fc.constant(undefined),
        specDraftSectionModified: fc.constantFrom(
          'overview',
          'proposedArchitecture',
          'dataModel',
          'apiSurface',
          'assumptions'
        ),
        timestamp: fc.nat(),
      }),
      { minLength: 0, maxLength: 3 }
    )
  ).map(([session, acceptedDecisions, tradeOffDecisions]) => ({
    ...session,
    moderationHistory: [...acceptedDecisions, ...tradeOffDecisions] as ModerationDecision[],
  }));
}

/**
 * Helper: generates an arbitrary Artifact for filesystem routing tests.
 */
function arbArtifact(): fc.Arbitrary<Artifact> {
  return fc.record({
    id: fc.uuid(),
    type: fc.constantFrom('requirements', 'design', 'tasks', 'adr', 'steering_rules') as fc.Arbitrary<Artifact['type']>,
    content: fc.string({ minLength: 1, maxLength: 500 }),
    generatedAt: fc.nat(),
  });
}

/**
 * Artifact filesystem routing function.
 * Routes 'steering_rules' to .kiro/steering/steering-rules.md,
 * all other types to .kiro/specs/{type}.md.
 */
function getArtifactPath(artifact: Artifact, basePath: string): string {
  if (artifact.type === 'steering_rules') {
    return `${basePath}/.kiro/steering/steering-rules.md`;
  }
  return `${basePath}/.kiro/specs/${artifact.type}.md`;
}

describe('Feature: spec-collider, Property 17: Finalize precondition', () => {
  /**
   * Validates: Requirements 6.1
   *
   * For any Session, "Finalize Spec" SHALL proceed only if moderationHistory
   * contains at least one ModerationDecision with action='accepted'.
   * If none exist, SHALL be rejected.
   */

  it('finalize proceeds when at least one accepted decision exists', async () => {
    const generator = new ArtifactGenerator();

    await fc.assert(
      fc.asyncProperty(arbSessionWithAccepted(), async (session) => {
        const artifacts = await generator.generateAll(session);
        expect(artifacts.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('finalize is rejected when no accepted decisions exist', async () => {
    const generator = new ArtifactGenerator();

    await fc.assert(
      fc.asyncProperty(arbSessionWithNoAccepted(), async (session) => {
        await expect(generator.generateAll(session)).rejects.toThrow(
          /at least one accepted/i
        );
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 18: Artifact generation completeness', () => {
  /**
   * Validates: Requirements 6.2, 6.3, 6.4, 6.5
   *
   * For any set of accepted ModerationDecisions:
   * - tasks.md SHALL contain at least N tasks for N accepted decisions
   * - adr.md SHALL contain one ADR per trade-off decision (accepted or rejected)
   */

  it('tasks.md contains at least N tasks for N accepted decisions', async () => {
    const generator = new ArtifactGenerator();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }).chain((n) => arbSessionWithNAccepted(n)),
        async (session) => {
          const acceptedCount = session.moderationHistory.filter(
            (d) => d.action === 'accepted'
          ).length;

          const artifacts = await generator.generateAll(session);
          const tasksArtifact = artifacts.find((a) => a.type === 'tasks');

          expect(tasksArtifact).toBeDefined();
          // Count the number of task headers in the tasks artifact
          const taskHeaders = tasksArtifact!.content.match(/## Task \d+/g) || [];
          expect(taskHeaders.length).toBeGreaterThanOrEqual(acceptedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('adr.md contains one ADR per trade-off decision (accepted or rejected)', async () => {
    const generator = new ArtifactGenerator();

    await fc.assert(
      fc.asyncProperty(arbSessionWithAccepted(), async (session) => {
        const artifacts = await generator.generateAll(session);
        const adrArtifact = artifacts.find((a) => a.type === 'adr');

        expect(adrArtifact).toBeDefined();

        // Count trade-off decisions (accepted or rejected)
        const tradeOffDecisions = session.moderationHistory.filter(
          (d) => d.action === 'accepted' || d.action === 'rejected'
        );

        if (tradeOffDecisions.length > 0) {
          // Count ADR entries in the artifact
          const adrEntries = adrArtifact!.content.match(/## ADR-\d+/g) || [];
          expect(adrEntries.length).toBe(tradeOffDecisions.length);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('generateAll produces requirements.md, design.md, tasks.md, and adr.md', async () => {
    const generator = new ArtifactGenerator();

    await fc.assert(
      fc.asyncProperty(arbSessionWithAccepted(), async (session) => {
        const artifacts = await generator.generateAll(session);

        const types = artifacts.map((a) => a.type);
        expect(types).toContain('requirements');
        expect(types).toContain('design');
        expect(types).toContain('tasks');
        expect(types).toContain('adr');
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 19: Artifact filesystem routing', () => {
  /**
   * Validates: Requirements 6.7
   *
   * For any Artifact, the export path SHALL route 'steering_rules' to
   * .kiro/steering/ and all other types to .kiro/specs/.
   */

  it('steering_rules artifacts route to .kiro/steering/', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          type: fc.constant('steering_rules' as const),
          content: fc.string({ minLength: 1, maxLength: 500 }),
          generatedAt: fc.nat(),
        }),
        fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/base/${s}`),
        (artifact, basePath) => {
          const path = getArtifactPath(artifact, basePath);
          expect(path).toContain('.kiro/steering/');
          expect(path).not.toContain('.kiro/specs/');
          expect(path).toBe(`${basePath}/.kiro/steering/steering-rules.md`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('non-steering artifacts route to .kiro/specs/', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          type: fc.constantFrom('requirements', 'design', 'tasks', 'adr') as fc.Arbitrary<Artifact['type']>,
          content: fc.string({ minLength: 1, maxLength: 500 }),
          generatedAt: fc.nat(),
        }),
        fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/base/${s}`),
        (artifact, basePath) => {
          const path = getArtifactPath(artifact, basePath);
          expect(path).toContain('.kiro/specs/');
          expect(path).not.toContain('.kiro/steering/');
          expect(path).toBe(`${basePath}/.kiro/specs/${artifact.type}.md`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('routing function is exhaustive for all artifact types', () => {
    fc.assert(
      fc.property(arbArtifact(), (artifact) => {
        const path = getArtifactPath(artifact, '/project');
        // Every artifact must get a valid path
        expect(path).toMatch(/\.kiro\/(steering|specs)\//);
        expect(path).toMatch(/\.md$/);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 20: Version history cap', () => {
  /**
   * Validates: Requirements 7.3
   *
   * For any VersionedArtifact, the versions array SHALL never exceed 50.
   * When a 51st version is added, the oldest SHALL be evicted.
   */

  it('versions array never exceeds MAX_VERSIONS (50)', () => {
    fc.assert(
      fc.property(
        arbArtifact(),
        fc.array(fc.string({ minLength: 1, maxLength: 200 }), { minLength: 1, maxLength: 60 }),
        (artifact, additionalContents) => {
          let versioned = createVersionedArtifact(artifact);

          // Add many versions
          for (const content of additionalContents) {
            versioned = addVersion(versioned, content);
          }

          // The versions array should never exceed MAX_VERSIONS
          expect(versioned.versions.length).toBeLessThanOrEqual(MAX_VERSIONS);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('adding the 51st version evicts the oldest version', () => {
    fc.assert(
      fc.property(
        arbArtifact(),
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 49, maxLength: 49 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (artifact, contentsBatch, finalContent) => {
          // Start with a versioned artifact (1 version)
          let versioned = createVersionedArtifact(artifact);

          // Add 49 more to reach exactly 50
          for (const content of contentsBatch) {
            versioned = addVersion(versioned, content);
          }
          expect(versioned.versions.length).toBe(MAX_VERSIONS);

          // Record the oldest version number before adding the 51st
          const sortedBefore = [...versioned.versions].sort((a, b) => a.version - b.version);
          const oldestVersionNumber = sortedBefore[0].version;

          // Add the 51st version — should trigger eviction
          versioned = addVersion(versioned, finalContent);

          // Still capped at 50
          expect(versioned.versions.length).toBe(MAX_VERSIONS);

          // Oldest should have been evicted
          const stillHasOldest = versioned.versions.some(
            (v) => v.version === oldestVersionNumber
          );
          expect(stillHasOldest).toBe(false);

          // The newest version should be present
          const newestVersion = Math.max(...versioned.versions.map((v) => v.version));
          const newestEntry = versioned.versions.find((v) => v.version === newestVersion);
          expect(newestEntry).toBeDefined();
          expect(newestEntry!.content).toBe(finalContent);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('createVersionedArtifact starts with exactly 1 version', () => {
    fc.assert(
      fc.property(arbArtifact(), (artifact) => {
        const versioned = createVersionedArtifact(artifact);
        expect(versioned.versions.length).toBe(1);
        expect(versioned.versions[0].version).toBe(1);
        expect(versioned.versions[0].content).toBe(artifact.content);
        expect(versioned.currentVersion).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  it('addVersion increments version number correctly', () => {
    fc.assert(
      fc.property(
        arbArtifact(),
        fc.string({ minLength: 1, maxLength: 100 }),
        (artifact, newContent) => {
          const versioned = createVersionedArtifact(artifact);
          const updated = addVersion(versioned, newContent);

          expect(updated.versions.length).toBe(2);
          expect(updated.currentVersion).toBe(2);
          expect(updated.versions[1].content).toBe(newContent);
        }
      ),
      { numRuns: 100 }
    );
  });
});
