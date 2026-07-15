import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  arbInputText,
  arbSpecDraft,
  arbRisk,
  arbMitigation,
  arbModerationDecision,
  arbActivityEntry,
  arbSession,
  arbAgentContext,
  arbMCPConnection,
  arbViewportWidth,
} from './generators.ts';

describe('generators', () => {
  it('arbInputText generates strings within length bounds', () => {
    fc.assert(
      fc.property(arbInputText(10, 100), (text) => {
        expect(text.length).toBeGreaterThanOrEqual(10);
        expect(text.length).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 }
    );
  });

  it('arbSpecDraft generates valid SpecDraft objects', () => {
    fc.assert(
      fc.property(arbSpecDraft(), (draft) => {
        expect(draft.overview.length).toBeGreaterThan(0);
        expect(draft.proposedArchitecture.length).toBeGreaterThan(0);
        expect(draft.dataModel.length).toBeGreaterThan(0);
        expect(draft.apiSurface.length).toBeGreaterThan(0);
        expect(draft.assumptions.length).toBeGreaterThan(0);
        expect(typeof draft.lastModified).toBe('number');
        expect(typeof draft.version).toBe('number');
      }),
      { numRuns: 100 }
    );
  });

  it('arbRisk generates valid Risk objects with correct enum values', () => {
    const validCategories = ['scalability', 'security', 'reliability', 'edge_case', 'missing_assumption'];
    const validSeverities = ['critical', 'high', 'medium', 'low'];

    fc.assert(
      fc.property(arbRisk(), (risk) => {
        expect(risk.id).toBeTruthy();
        expect(risk.title.length).toBeGreaterThan(0);
        expect(validCategories).toContain(risk.category);
        expect(validSeverities).toContain(risk.severity);
        expect(risk.description.length).toBeGreaterThan(0);
        expect(risk.affectedComponents.length).toBeGreaterThan(0);
        expect(risk.evidence.length).toBeGreaterThan(0);
        expect(typeof risk.isChaosRound).toBe('boolean');
        expect(typeof risk.createdAt).toBe('number');
      }),
      { numRuns: 100 }
    );
  });

  it('arbMitigation generates valid Mitigation with optional riskId override', () => {
    const validResponseTypes = ['fix', 'trade_off', 'accepted_risk'];

    fc.assert(
      fc.property(arbMitigation(), (mitigation) => {
        expect(mitigation.id).toBeTruthy();
        expect(mitigation.riskId).toBeTruthy();
        expect(mitigation.riskTitle.length).toBeGreaterThan(0);
        expect(validResponseTypes).toContain(mitigation.responseType);
        expect(mitigation.description.length).toBeGreaterThan(0);
        expect(Array.isArray(mitigation.technologies)).toBe(true);
        expect(Array.isArray(mitigation.tradeOffs)).toBe(true);
        expect(typeof mitigation.createdAt).toBe('number');
      }),
      { numRuns: 100 }
    );

    // Test with provided riskId
    const fixedRiskId = '12345678-1234-1234-1234-123456789012';
    fc.assert(
      fc.property(arbMitigation(fixedRiskId), (mitigation) => {
        expect(mitigation.riskId).toBe(fixedRiskId);
      }),
      { numRuns: 20 }
    );
  });

  it('arbModerationDecision generates valid decisions with correct action types', () => {
    const validActions = ['accepted', 'rejected', 'edited'];

    fc.assert(
      fc.property(arbModerationDecision(), (decision) => {
        expect(decision.id).toBeTruthy();
        expect(decision.mitigationId).toBeTruthy();
        expect(validActions).toContain(decision.action);
        expect(decision.specDraftSectionModified).toBeTruthy();
        expect(typeof decision.timestamp).toBe('number');

        if (decision.action === 'rejected') {
          expect(decision.reason).toBeTruthy();
        }
        if (decision.action === 'edited') {
          expect(decision.modifiedText).toBeTruthy();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('arbActivityEntry generates valid entries with correct enum values', () => {
    const validTypes = ['idea_submitted', 'risk_identified', 'mitigation_proposed', 'decision_made', 'chaos_triggered'];
    const validContributors = ['user', 'red_team_agent', 'architect_agent'];

    fc.assert(
      fc.property(arbActivityEntry(), (entry) => {
        expect(entry.id).toBeTruthy();
        expect(validTypes).toContain(entry.type);
        expect(validContributors).toContain(entry.contributor);
        expect(entry.content.length).toBeGreaterThan(0);
        expect(typeof entry.timestamp).toBe('number');
        expect(typeof entry.streamComplete).toBe('boolean');
        expect(typeof entry.mcpGrounded).toBe('boolean');
        expect(typeof entry.partiallyGrounded).toBe('boolean');
        expect(Array.isArray(entry.unavailableProviders)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('arbSession generates valid sessions with consistent state', () => {
    fc.assert(
      fc.property(arbSession(), (session) => {
        expect(session.id).toBeTruthy();
        expect(typeof session.createdAt).toBe('number');
        expect(typeof session.updatedAt).toBe('number');
        expect(session.specDraft).toBeDefined();
        expect(session.specDraft.overview.length).toBeGreaterThan(0);
        expect(Array.isArray(session.activityFeed)).toBe(true);
        expect(Array.isArray(session.moderationHistory)).toBe(true);
        expect(Array.isArray(session.artifacts)).toBe(true);
        expect(Array.isArray(session.mcpConnections)).toBe(true);
        expect(['active', 'finalized']).toContain(session.status);
      }),
      { numRuns: 100 }
    );
  });

  it('arbAgentContext generates valid context for a specific role', () => {
    fc.assert(
      fc.property(arbAgentContext('red_team_agent'), (ctx) => {
        expect(ctx.systemPrompt).toContain('Red Team');
        expect(ctx.specDraft).toBeDefined();
        expect(Array.isArray(ctx.activityHistory)).toBe(true);
        expect(Array.isArray(ctx.mcpContext)).toBe(true);
      }),
      { numRuns: 50 }
    );

    fc.assert(
      fc.property(arbAgentContext('architect_agent'), (ctx) => {
        expect(ctx.systemPrompt).toContain('Architect');
        expect(ctx.specDraft).toBeDefined();
        expect(Array.isArray(ctx.activityHistory)).toBe(true);
        expect(Array.isArray(ctx.mcpContext)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('arbMCPConnection generates valid connections with correct status values', () => {
    const validStatuses = ['connected', 'disconnected', 'error', 'connected_no_data'];

    fc.assert(
      fc.property(arbMCPConnection(), (conn) => {
        expect(conn.id).toBeTruthy();
        expect(conn.config).toBeDefined();
        expect(conn.config.id).toBeTruthy();
        expect(conn.config.name.length).toBeGreaterThan(0);
        expect(conn.config.uri).toBeTruthy();
        expect(conn.config.capabilities.length).toBeGreaterThan(0);
        expect(validStatuses).toContain(conn.status);
      }),
      { numRuns: 100 }
    );
  });

  it('arbViewportWidth generates integers in realistic range (320–3840)', () => {
    fc.assert(
      fc.property(arbViewportWidth(), (width) => {
        expect(Number.isInteger(width)).toBe(true);
        expect(width).toBeGreaterThanOrEqual(320);
        expect(width).toBeLessThanOrEqual(3840);
      }),
      { numRuns: 100 }
    );
  });
});
