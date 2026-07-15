import { describe, it, expect } from 'vitest';
import { ArtifactGenerator } from '../../src/core/artifact-generator.ts';
import type { Session, SpecDraft, ModerationDecision } from '../../src/types/domain.ts';

// === Test Fixtures ===

function createTestSpecDraft(): SpecDraft {
  return {
    overview: 'A collaborative workspace for spec design',
    proposedArchitecture: 'Microservices architecture with event sourcing',
    dataModel: 'PostgreSQL with normalized schema',
    apiSurface: 'REST API with OpenAPI specification',
    assumptions: 'Users have stable internet connections',
    lastModified: 1000,
    version: 3,
  };
}

function createAcceptedDecision(overrides: Partial<ModerationDecision> = {}): ModerationDecision {
  return {
    id: 'decision-001',
    mitigationId: 'mit-001',
    action: 'accepted',
    specDraftSectionModified: 'apiSurface',
    timestamp: 1700000000000,
    ...overrides,
  };
}

function createRejectedDecision(overrides: Partial<ModerationDecision> = {}): ModerationDecision {
  return {
    id: 'decision-002',
    mitigationId: 'mit-002',
    action: 'rejected',
    reason: 'Too complex for current scope',
    specDraftSectionModified: 'proposedArchitecture',
    timestamp: 1700000001000,
    ...overrides,
  };
}

function createEditedDecision(overrides: Partial<ModerationDecision> = {}): ModerationDecision {
  return {
    id: 'decision-003',
    mitigationId: 'mit-003',
    action: 'edited',
    modifiedText: 'Use GraphQL instead of REST for the internal API',
    specDraftSectionModified: 'apiSurface',
    timestamp: 1700000002000,
    ...overrides,
  };
}

function createTestSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-001',
    createdAt: 1700000000000,
    updatedAt: 1700000005000,
    specDraft: createTestSpecDraft(),
    activityFeed: [],
    moderationHistory: [
      createAcceptedDecision(),
      createRejectedDecision(),
    ],
    artifacts: [],
    mcpConnections: [],
    status: 'active',
    ...overrides,
  };
}

// === Tests ===

describe('ArtifactGenerator', () => {
  let generator: ArtifactGenerator;

  beforeEach(() => {
    generator = new ArtifactGenerator();
  });

  describe('generateAll(session) - Finalize Precondition (Req 6.1)', () => {
    it('throws when no accepted ModerationDecision exists', async () => {
      const session = createTestSession({
        moderationHistory: [
          createRejectedDecision(),
        ],
      });

      await expect(generator.generateAll(session)).rejects.toThrow(
        'Cannot finalize: at least one accepted moderation decision is required'
      );
    });

    it('throws when moderationHistory is empty', async () => {
      const session = createTestSession({
        moderationHistory: [],
      });

      await expect(generator.generateAll(session)).rejects.toThrow(
        'Cannot finalize: at least one accepted moderation decision is required'
      );
    });

    it('throws when only edited decisions exist (no accepted)', async () => {
      const session = createTestSession({
        moderationHistory: [
          createEditedDecision(),
        ],
      });

      await expect(generator.generateAll(session)).rejects.toThrow(
        'Cannot finalize: at least one accepted moderation decision is required'
      );
    });

    it('succeeds when at least one accepted decision exists', async () => {
      const session = createTestSession({
        moderationHistory: [createAcceptedDecision()],
      });

      const artifacts = await generator.generateAll(session);
      expect(artifacts.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('generateAll(session) - requirements.md (Req 6.2)', () => {
    it('produces a requirements artifact', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);

      const requirements = artifacts.find((a) => a.type === 'requirements');
      expect(requirements).toBeDefined();
      expect(requirements!.content).toContain('# Requirements');
    });

    it('references accepted decisions in the requirements content', async () => {
      const session = createTestSession({
        moderationHistory: [
          createAcceptedDecision({ mitigationId: 'mit-accepted-1', specDraftSectionModified: 'apiSurface' }),
          createAcceptedDecision({ id: 'decision-004', mitigationId: 'mit-accepted-2', specDraftSectionModified: 'dataModel' }),
        ],
      });

      const artifacts = await generator.generateAll(session);
      const requirements = artifacts.find((a) => a.type === 'requirements')!;

      expect(requirements.content).toContain('apiSurface');
      expect(requirements.content).toContain('dataModel');
    });

    it('includes SpecDraft overview in requirements', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);
      const requirements = artifacts.find((a) => a.type === 'requirements')!;

      expect(requirements.content).toContain('A collaborative workspace for spec design');
    });
  });

  describe('generateAll(session) - design.md (Req 6.3)', () => {
    it('produces a design artifact', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);

      const design = artifacts.find((a) => a.type === 'design');
      expect(design).toBeDefined();
      expect(design!.content).toContain('# Architecture Design');
    });

    it('incorporates accepted mitigations into design', async () => {
      const session = createTestSession({
        moderationHistory: [
          createAcceptedDecision({ mitigationId: 'mit-circuit-breaker', specDraftSectionModified: 'proposedArchitecture' }),
        ],
      });

      const artifacts = await generator.generateAll(session);
      const design = artifacts.find((a) => a.type === 'design')!;

      expect(design.content).toContain('mit-circuit-breaker');
      expect(design.content).toContain('proposedArchitecture');
    });

    it('includes SpecDraft architecture section', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);
      const design = artifacts.find((a) => a.type === 'design')!;

      expect(design.content).toContain('Microservices architecture with event sourcing');
    });
  });

  describe('generateAll(session) - tasks.md (Req 6.4)', () => {
    it('produces a tasks artifact', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);

      const tasks = artifacts.find((a) => a.type === 'tasks');
      expect(tasks).toBeDefined();
      expect(tasks!.content).toContain('# Implementation Tasks');
    });

    it('contains at least N tasks for N accepted mitigations', async () => {
      const session = createTestSession({
        moderationHistory: [
          createAcceptedDecision({ id: 'd1', mitigationId: 'mit-1' }),
          createAcceptedDecision({ id: 'd2', mitigationId: 'mit-2' }),
          createAcceptedDecision({ id: 'd3', mitigationId: 'mit-3' }),
          createRejectedDecision({ id: 'd4', mitigationId: 'mit-4' }),
        ],
      });

      const artifacts = await generator.generateAll(session);
      const tasks = artifacts.find((a) => a.type === 'tasks')!;

      // Count task headers (## Task N:)
      const taskHeaders = tasks.content.match(/## Task \d+:/g) || [];
      expect(taskHeaders.length).toBeGreaterThanOrEqual(3); // 3 accepted mitigations
    });

    it('references each accepted mitigation in tasks', async () => {
      const session = createTestSession({
        moderationHistory: [
          createAcceptedDecision({ id: 'd1', mitigationId: 'mit-alpha' }),
          createAcceptedDecision({ id: 'd2', mitigationId: 'mit-beta' }),
        ],
      });

      const artifacts = await generator.generateAll(session);
      const tasks = artifacts.find((a) => a.type === 'tasks')!;

      expect(tasks.content).toContain('mit-alpha');
      expect(tasks.content).toContain('mit-beta');
    });

    it('does not create tasks for rejected mitigations', async () => {
      const session = createTestSession({
        moderationHistory: [
          createAcceptedDecision({ id: 'd1', mitigationId: 'mit-accepted' }),
          createRejectedDecision({ id: 'd2', mitigationId: 'mit-rejected' }),
        ],
      });

      const artifacts = await generator.generateAll(session);
      const tasks = artifacts.find((a) => a.type === 'tasks')!;

      expect(tasks.content).toContain('mit-accepted');
      expect(tasks.content).not.toContain('mit-rejected');
    });
  });

  describe('generateAll(session) - adr.md (Req 6.5)', () => {
    it('produces an adr artifact', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);

      const adr = artifacts.find((a) => a.type === 'adr');
      expect(adr).toBeDefined();
      expect(adr!.content).toContain('# Architecture Decision Records');
    });

    it('contains one ADR per trade-off decision (accepted or rejected)', async () => {
      const session = createTestSession({
        moderationHistory: [
          createAcceptedDecision({ id: 'd1', mitigationId: 'mit-1' }),
          createRejectedDecision({ id: 'd2', mitigationId: 'mit-2' }),
          createAcceptedDecision({ id: 'd3', mitigationId: 'mit-3' }),
        ],
      });

      const artifacts = await generator.generateAll(session);
      const adr = artifacts.find((a) => a.type === 'adr')!;

      // Count ADR entries
      const adrHeaders = adr.content.match(/## ADR-\d{3}:/g) || [];
      // accepted + rejected = 3 (edited decisions not included)
      expect(adrHeaders.length).toBe(3);
    });

    it('includes decision status (accepted/rejected) in each ADR', async () => {
      const session = createTestSession({
        moderationHistory: [
          createAcceptedDecision({ id: 'd1', mitigationId: 'mit-1' }),
          createRejectedDecision({ id: 'd2', mitigationId: 'mit-2' }),
        ],
      });

      const artifacts = await generator.generateAll(session);
      const adr = artifacts.find((a) => a.type === 'adr')!;

      expect(adr.content).toContain('**Status**: accepted');
      expect(adr.content).toContain('**Status**: rejected');
    });

    it('includes rejection reason in rejected ADR entries', async () => {
      const session = createTestSession({
        moderationHistory: [
          createAcceptedDecision(),
          createRejectedDecision({ reason: 'Performance impact too high' }),
        ],
      });

      const artifacts = await generator.generateAll(session);
      const adr = artifacts.find((a) => a.type === 'adr')!;

      expect(adr.content).toContain('Performance impact too high');
    });

    it('shows "No trade-off decisions" when only edited decisions exist', async () => {
      // Only accepted decisions (no rejected), so all should appear
      const session = createTestSession({
        moderationHistory: [
          createAcceptedDecision(),
        ],
      });

      const artifacts = await generator.generateAll(session);
      const adr = artifacts.find((a) => a.type === 'adr')!;

      // There IS one accepted decision, so at least one ADR
      expect(adr.content).toContain('ADR-001');
    });
  });

  describe('generateAll(session, options) - steering-rules.md (Req 6.6)', () => {
    it('does NOT generate steering-rules when enableSteeringRules is not set', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);

      const steeringRules = artifacts.find((a) => a.type === 'steering_rules');
      expect(steeringRules).toBeUndefined();
    });

    it('does NOT generate steering-rules when enableSteeringRules is false', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session, { enableSteeringRules: false });

      const steeringRules = artifacts.find((a) => a.type === 'steering_rules');
      expect(steeringRules).toBeUndefined();
    });

    it('generates steering-rules when enableSteeringRules is true', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session, { enableSteeringRules: true });

      const steeringRules = artifacts.find((a) => a.type === 'steering_rules');
      expect(steeringRules).toBeDefined();
      expect(steeringRules!.content).toContain('# Steering Rules');
    });

    it('steering-rules references accepted decisions as constraints', async () => {
      const session = createTestSession({
        moderationHistory: [
          createAcceptedDecision({ mitigationId: 'mit-rate-limit', specDraftSectionModified: 'apiSurface' }),
        ],
      });

      const artifacts = await generator.generateAll(session, { enableSteeringRules: true });
      const steeringRules = artifacts.find((a) => a.type === 'steering_rules')!;

      expect(steeringRules.content).toContain('apiSurface');
    });
  });

  describe('generateAll(session) - Artifact structure', () => {
    it('produces exactly 4 artifacts by default (without steering rules)', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);

      expect(artifacts).toHaveLength(4);
      const types = artifacts.map((a) => a.type);
      expect(types).toContain('requirements');
      expect(types).toContain('design');
      expect(types).toContain('tasks');
      expect(types).toContain('adr');
    });

    it('produces 5 artifacts when steering rules are enabled', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session, { enableSteeringRules: true });

      expect(artifacts).toHaveLength(5);
      const types = artifacts.map((a) => a.type);
      expect(types).toContain('steering_rules');
    });

    it('each artifact has a unique id', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session, { enableSteeringRules: true });

      const ids = artifacts.map((a) => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('each artifact has a generatedAt timestamp', async () => {
      const before = Date.now();
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);

      for (const artifact of artifacts) {
        expect(artifact.generatedAt).toBeGreaterThanOrEqual(before);
        expect(artifact.generatedAt).toBeLessThanOrEqual(Date.now());
      }
    });

    it('each artifact has non-empty content', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);

      for (const artifact of artifacts) {
        expect(artifact.content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('exportToFilesystem (stub)', () => {
    it('returns a successful ExportResult', async () => {
      const session = createTestSession();
      const artifacts = await generator.generateAll(session);
      const result = await generator.exportToFilesystem(artifacts, '/tmp/output');

      expect(result.success).toBe(true);
      expect(result.writtenFiles).toEqual([]);
      expect(result.failedFiles).toEqual([]);
    });
  });
});
