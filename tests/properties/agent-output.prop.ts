import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseRedTeamOutput } from '../../src/agents/red-team-parser.ts';
import { parseArchitectOutput } from '../../src/agents/architect-parser.ts';
import { arbRisk, arbMitigation } from '../generators.ts';
import type { Risk, Mitigation } from '../../src/types/domain.ts';

// === Valid enum constants for verification ===

const VALID_CATEGORIES: Risk['category'][] = [
  'scalability',
  'security',
  'reliability',
  'edge_case',
  'missing_assumption',
];

const VALID_SEVERITIES: Risk['severity'][] = [
  'critical',
  'high',
  'medium',
  'low',
];

const VALID_RESPONSE_TYPES: Mitigation['responseType'][] = [
  'fix',
  'trade_off',
  'accepted_risk',
];

describe('Feature: spec-collider, Property 4: Red Team output exclusivity and structure', () => {
  /**
   * Validates: Requirements 2.2, 10.3
   *
   * For any parsed output from the Red Team Agent, every item SHALL conform to the
   * Risk interface (containing valid title, category, severity, description,
   * affectedComponents, and evidence) and no item SHALL conform to the Mitigation interface.
   */

  it('every parsed Risk conforms to the Risk interface with valid fields', () => {
    fc.assert(
      fc.property(arbRisk(), (risk) => {
        // Serialize a valid Risk object to JSON and parse it back through the parser
        const riskJson = JSON.stringify([{
          title: risk.title,
          category: risk.category,
          severity: risk.severity,
          description: risk.description,
          affectedComponents: risk.affectedComponents,
          evidence: risk.evidence,
        }]);

        const results = parseRedTeamOutput(riskJson, false);

        for (const result of results) {
          // Verify Risk interface conformance
          expect(typeof result.id).toBe('string');
          expect(result.id.length).toBeGreaterThan(0);
          expect(typeof result.title).toBe('string');
          expect(result.title.length).toBeGreaterThan(0);
          expect(VALID_CATEGORIES).toContain(result.category);
          expect(VALID_SEVERITIES).toContain(result.severity);
          expect(typeof result.description).toBe('string');
          expect(result.description.length).toBeGreaterThan(0);
          expect(Array.isArray(result.affectedComponents)).toBe(true);
          expect(result.affectedComponents.length).toBeGreaterThan(0);
          result.affectedComponents.forEach((comp) => {
            expect(typeof comp).toBe('string');
            expect(comp.length).toBeGreaterThan(0);
          });
          expect(typeof result.evidence).toBe('string');
          expect(result.evidence.length).toBeGreaterThan(0);
          expect(typeof result.isChaosRound).toBe('boolean');
          expect(typeof result.createdAt).toBe('number');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('parsed Risk output does NOT conform to the Mitigation interface', () => {
    fc.assert(
      fc.property(arbRisk(), (risk) => {
        const riskJson = JSON.stringify([{
          title: risk.title,
          category: risk.category,
          severity: risk.severity,
          description: risk.description,
          affectedComponents: risk.affectedComponents,
          evidence: risk.evidence,
        }]);

        const results = parseRedTeamOutput(riskJson, false);

        for (const result of results) {
          // Verify it does NOT have Mitigation-specific fields
          const asAny = result as unknown as Record<string, unknown>;
          expect(asAny).not.toHaveProperty('riskId');
          expect(asAny).not.toHaveProperty('responseType');
          expect(asAny).not.toHaveProperty('technologies');
          expect(asAny).not.toHaveProperty('riskTitle');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('rejects items that look like Mitigations when fed to the red team parser', () => {
    fc.assert(
      fc.property(arbMitigation(), (mitigation) => {
        // Feed a Mitigation-shaped object to the red team parser — should be rejected
        const mitigationJson = JSON.stringify([{
          riskId: mitigation.riskId,
          riskTitle: mitigation.riskTitle,
          responseType: mitigation.responseType,
          description: mitigation.description,
          technologies: mitigation.technologies,
        }]);

        const results = parseRedTeamOutput(mitigationJson, false);
        // Should produce no valid Risks from Mitigation-shaped input
        expect(results.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 5: Chaos round labeling', () => {
  /**
   * Validates: Requirements 2.5
   *
   * For any Risk produced during a chaos round invocation, the isChaosRound field
   * SHALL be true; for any Risk produced during a standard invocation, the
   * isChaosRound field SHALL be false.
   */

  it('risks from chaos round have isChaosRound=true', () => {
    fc.assert(
      fc.property(arbRisk(), (risk) => {
        const riskJson = JSON.stringify([{
          title: risk.title,
          category: risk.category,
          severity: risk.severity,
          description: risk.description,
          affectedComponents: risk.affectedComponents,
          evidence: risk.evidence,
        }]);

        const results = parseRedTeamOutput(riskJson, true); // isChaosRound = true

        for (const result of results) {
          expect(result.isChaosRound).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('risks from standard invocation have isChaosRound=false', () => {
    fc.assert(
      fc.property(arbRisk(), (risk) => {
        const riskJson = JSON.stringify([{
          title: risk.title,
          category: risk.category,
          severity: risk.severity,
          description: risk.description,
          affectedComponents: risk.affectedComponents,
          evidence: risk.evidence,
        }]);

        const results = parseRedTeamOutput(riskJson, false); // isChaosRound = false

        for (const result of results) {
          expect(result.isChaosRound).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 6: Architect output exclusivity and structure', () => {
  /**
   * Validates: Requirements 3.2, 10.4
   *
   * For any parsed output from the Architect Agent, every item SHALL conform to the
   * Mitigation interface (containing a valid riskId, riskTitle, responseType, description,
   * and technologies array) and no item SHALL conform to the Risk interface.
   */

  it('every parsed Mitigation conforms to the Mitigation interface with valid fields', () => {
    fc.assert(
      fc.property(arbMitigation(), (mitigation) => {
        const mitigationJson = JSON.stringify([{
          riskId: mitigation.riskId,
          riskTitle: mitigation.riskTitle,
          responseType: mitigation.responseType,
          description: mitigation.description,
          technologies: mitigation.technologies,
          tradeOffs: mitigation.tradeOffs,
        }]);

        const results = parseArchitectOutput(mitigationJson);

        for (const result of results) {
          // Verify Mitigation interface conformance
          expect(typeof result.id).toBe('string');
          expect(result.id.length).toBeGreaterThan(0);
          expect(typeof result.riskId).toBe('string');
          expect(result.riskId.length).toBeGreaterThan(0);
          expect(typeof result.riskTitle).toBe('string');
          expect(result.riskTitle.length).toBeGreaterThan(0);
          expect(VALID_RESPONSE_TYPES).toContain(result.responseType);
          expect(typeof result.description).toBe('string');
          expect(result.description.length).toBeGreaterThan(0);
          expect(Array.isArray(result.technologies)).toBe(true);
          expect(result.technologies.length).toBeGreaterThan(0);
          result.technologies.forEach((tech) => {
            expect(typeof tech).toBe('string');
            expect(tech.length).toBeGreaterThan(0);
          });
          expect(Array.isArray(result.tradeOffs)).toBe(true);
          expect(typeof result.createdAt).toBe('number');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('parsed Mitigation output does NOT conform to the Risk interface', () => {
    fc.assert(
      fc.property(arbMitigation(), (mitigation) => {
        const mitigationJson = JSON.stringify([{
          riskId: mitigation.riskId,
          riskTitle: mitigation.riskTitle,
          responseType: mitigation.responseType,
          description: mitigation.description,
          technologies: mitigation.technologies,
        }]);

        const results = parseArchitectOutput(mitigationJson);

        for (const result of results) {
          // Verify it does NOT have Risk-specific fields
          const asAny = result as unknown as Record<string, unknown>;
          expect(asAny).not.toHaveProperty('category');
          expect(asAny).not.toHaveProperty('severity');
          expect(asAny).not.toHaveProperty('affectedComponents');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('rejects items that look like Risks when fed to the architect parser', () => {
    fc.assert(
      fc.property(arbRisk(), (risk) => {
        // Feed a Risk-shaped object to the architect parser — should be rejected
        const riskJson = JSON.stringify([{
          title: risk.title,
          category: risk.category,
          severity: risk.severity,
          description: risk.description,
          affectedComponents: risk.affectedComponents,
          evidence: risk.evidence,
        }]);

        const results = parseArchitectOutput(riskJson);
        // Should produce no valid Mitigations from Risk-shaped input
        expect(results.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});
