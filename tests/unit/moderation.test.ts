import { describe, it, expect, beforeEach } from 'vitest';
import { ModerationService, determineMitigationTargetSection } from '../../src/core/moderation.ts';
import type { SpecDraft, Mitigation } from '../../src/types/domain.ts';

// === Test Fixtures ===

function createTestSpecDraft(): SpecDraft {
  return {
    overview: 'Original overview content',
    proposedArchitecture: 'Original architecture content',
    dataModel: 'Original data model content',
    apiSurface: 'Original API surface content',
    assumptions: 'Original assumptions content',
    lastModified: 1000,
    version: 1,
  };
}

function createTestMitigation(overrides: Partial<Mitigation> = {}): Mitigation {
  return {
    id: 'mit-001',
    riskId: 'risk-001',
    riskTitle: 'API endpoint vulnerability',
    responseType: 'fix',
    description: 'Add rate limiting to the API endpoints',
    technologies: ['express-rate-limit'],
    tradeOffs: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

function createArchitectureMitigation(overrides: Partial<Mitigation> = {}): Mitigation {
  return createTestMitigation({
    id: 'mit-002',
    riskTitle: 'Service architecture flaw',
    description: 'Introduce a circuit breaker component for service resilience',
    ...overrides,
  });
}

function createDataModelMitigation(overrides: Partial<Mitigation> = {}): Mitigation {
  return createTestMitigation({
    id: 'mit-003',
    riskTitle: 'Database schema issue',
    description: 'Add index to the data model for faster queries',
    ...overrides,
  });
}

// === Tests ===

describe('ModerationService', () => {
  let specDraft: SpecDraft;
  let mitigations: Mitigation[];
  let service: ModerationService;

  beforeEach(() => {
    specDraft = createTestSpecDraft();
    mitigations = [
      createTestMitigation(),
      createArchitectureMitigation(),
      createDataModelMitigation(),
    ];
    service = new ModerationService(specDraft, mitigations);
  });

  describe('accept(mitigationId)', () => {
    it('applies mitigation description to the targeted SpecDraft section', async () => {
      const result = await service.accept('mit-001');
      // mit-001 targets apiSurface (has "API" keyword)
      expect(result.apiSurface).toBe('Add rate limiting to the API endpoints');
    });

    it('preserves non-targeted sections unchanged', async () => {
      const result = await service.accept('mit-001');
      expect(result.overview).toBe('Original overview content');
      expect(result.proposedArchitecture).toBe('Original architecture content');
      expect(result.dataModel).toBe('Original data model content');
      expect(result.assumptions).toBe('Original assumptions content');
    });

    it('increments the SpecDraft version', async () => {
      const result = await service.accept('mit-001');
      expect(result.version).toBe(2);
    });

    it('updates lastModified timestamp', async () => {
      const before = Date.now();
      const result = await service.accept('mit-001');
      expect(result.lastModified).toBeGreaterThanOrEqual(before);
    });

    it('records a ModerationDecision with action=accepted', async () => {
      await service.accept('mit-001');
      const decisions = service.getDecisions();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].mitigationId).toBe('mit-001');
      expect(decisions[0].action).toBe('accepted');
      expect(decisions[0].specDraftSectionModified).toBe('apiSurface');
      expect(decisions[0].timestamp).toBeGreaterThan(0);
    });

    it('throws when mitigation is not found', async () => {
      await expect(service.accept('nonexistent')).rejects.toThrow('Mitigation not found: nonexistent');
    });

    it('applies architecture mitigation to proposedArchitecture section', async () => {
      const result = await service.accept('mit-002');
      expect(result.proposedArchitecture).toBe('Introduce a circuit breaker component for service resilience');
    });

    it('applies data model mitigation to dataModel section', async () => {
      const result = await service.accept('mit-003');
      expect(result.dataModel).toBe('Add index to the data model for faster queries');
    });
  });

  describe('reject(mitigationId, reason)', () => {
    it('records a ModerationDecision with action=rejected and the given reason', async () => {
      await service.reject('mit-001', 'Not appropriate for our use case');
      const decisions = service.getDecisions();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].action).toBe('rejected');
      expect(decisions[0].reason).toBe('Not appropriate for our use case');
      expect(decisions[0].mitigationId).toBe('mit-001');
    });

    it('preserves SpecDraft completely unchanged', async () => {
      const before = service.getSpecDraft();
      await service.reject('mit-001', 'Rejected because of cost');
      const after = service.getSpecDraft();
      expect(after.overview).toBe(before.overview);
      expect(after.proposedArchitecture).toBe(before.proposedArchitecture);
      expect(after.dataModel).toBe(before.dataModel);
      expect(after.apiSurface).toBe(before.apiSurface);
      expect(after.assumptions).toBe(before.assumptions);
      expect(after.version).toBe(before.version);
    });

    it('throws if reason is empty', async () => {
      await expect(service.reject('mit-001', '')).rejects.toThrow(
        'Rejection reason must be between 1 and 1000 characters'
      );
    });

    it('throws if reason exceeds 1000 characters', async () => {
      await expect(service.reject('mit-001', 'x'.repeat(1001))).rejects.toThrow(
        'Rejection reason must be between 1 and 1000 characters'
      );
    });

    it('accepts reason at maximum valid length (1000 chars)', async () => {
      await service.reject('mit-001', 'r'.repeat(1000));
      const decisions = service.getDecisions();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].reason).toBe('r'.repeat(1000));
    });

    it('accepts reason at minimum valid length (1 char)', async () => {
      await service.reject('mit-001', 'x');
      const decisions = service.getDecisions();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].reason).toBe('x');
    });

    it('throws when mitigation is not found', async () => {
      await expect(service.reject('nonexistent', 'reason')).rejects.toThrow('Mitigation not found: nonexistent');
    });
  });

  describe('edit(mitigationId, modifiedText)', () => {
    it('applies modified text to the targeted SpecDraft section', async () => {
      const result = await service.edit('mit-001', 'Custom API security implementation');
      expect(result.apiSurface).toBe('Custom API security implementation');
    });

    it('records a ModerationDecision with action=edited and the modifiedText', async () => {
      await service.edit('mit-001', 'Custom edit text');
      const decisions = service.getDecisions();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].action).toBe('edited');
      expect(decisions[0].modifiedText).toBe('Custom edit text');
      expect(decisions[0].mitigationId).toBe('mit-001');
    });

    it('increments the SpecDraft version', async () => {
      const result = await service.edit('mit-001', 'Edited content');
      expect(result.version).toBe(2);
    });

    it('throws if text is empty', async () => {
      await expect(service.edit('mit-001', '')).rejects.toThrow(
        'Edit text must be between 1 and 5000 characters'
      );
    });

    it('throws if text exceeds 5000 characters', async () => {
      await expect(service.edit('mit-001', 'x'.repeat(5001))).rejects.toThrow(
        'Edit text must be between 1 and 5000 characters'
      );
    });

    it('accepts text at maximum valid length (5000 chars)', async () => {
      const longText = 't'.repeat(5000);
      const result = await service.edit('mit-001', longText);
      expect(result.apiSurface).toBe(longText);
    });

    it('throws when mitigation is not found', async () => {
      await expect(service.edit('nonexistent', 'text')).rejects.toThrow('Mitigation not found: nonexistent');
    });
  });

  describe('checkConflict(mitigationId, specDraft)', () => {
    it('returns hasConflict=false when no prior decisions exist', () => {
      const result = service.checkConflict('mit-001', specDraft);
      expect(result.hasConflict).toBe(false);
      expect(result.conflictingDecision).toBeUndefined();
      expect(result.affectedSection).toBeUndefined();
    });

    it('returns hasConflict=true when another accepted decision targets the same section', async () => {
      // mit-001 targets apiSurface
      await service.accept('mit-001');

      // Create a new mitigation also targeting apiSurface
      const conflictingMitigation = createTestMitigation({
        id: 'mit-004',
        riskTitle: 'Another API issue',
        description: 'Different API fix',
      });
      const serviceWithConflict = new ModerationService(
        service.getSpecDraft(),
        [...mitigations, conflictingMitigation],
        service.getDecisions()
      );

      const result = serviceWithConflict.checkConflict('mit-004', service.getSpecDraft());
      expect(result.hasConflict).toBe(true);
      expect(result.conflictingDecision?.mitigationId).toBe('mit-001');
      expect(result.affectedSection).toBe('apiSurface');
    });

    it('returns hasConflict=false when prior decisions target different sections', async () => {
      // Accept mit-002 which targets proposedArchitecture
      await service.accept('mit-002');

      // Check mit-001 which targets apiSurface (different section)
      const result = service.checkConflict('mit-001', service.getSpecDraft());
      expect(result.hasConflict).toBe(false);
    });

    it('detects conflict with edited decisions too', async () => {
      // Edit mit-001 (targets apiSurface)
      await service.edit('mit-001', 'Edited content');

      // Create another mitigation targeting apiSurface
      const conflictingMitigation = createTestMitigation({
        id: 'mit-005',
        riskTitle: 'API performance',
        description: 'Optimize API caching',
      });
      const serviceWithConflict = new ModerationService(
        service.getSpecDraft(),
        [...mitigations, conflictingMitigation],
        service.getDecisions()
      );

      const result = serviceWithConflict.checkConflict('mit-005', service.getSpecDraft());
      expect(result.hasConflict).toBe(true);
      expect(result.conflictingDecision?.action).toBe('edited');
    });

    it('does not consider rejected decisions as conflicts', async () => {
      // Reject mit-001 (targets apiSurface but rejected = no modification)
      await service.reject('mit-001', 'Not needed');

      // Create another mitigation targeting apiSurface
      const anotherApiMitigation = createTestMitigation({
        id: 'mit-006',
        riskTitle: 'API latency issue',
        description: 'Add API response caching',
      });
      const serviceWithRejection = new ModerationService(
        service.getSpecDraft(),
        [...mitigations, anotherApiMitigation],
        service.getDecisions()
      );

      const result = serviceWithRejection.checkConflict('mit-006', service.getSpecDraft());
      expect(result.hasConflict).toBe(false);
    });

    it('does not flag a mitigation as conflicting with itself', async () => {
      await service.accept('mit-001');
      // Checking mit-001 against itself should not report conflict
      const result = service.checkConflict('mit-001', service.getSpecDraft());
      expect(result.hasConflict).toBe(false);
    });
  });

  describe('cancel()', () => {
    it('discards pending edit state', () => {
      service.setPendingEdit('mit-001', 'Some pending text');
      expect(service.getPendingEdit()).not.toBeNull();
      service.cancel();
      expect(service.getPendingEdit()).toBeNull();
    });

    it('preserves SpecDraft unchanged after cancel', () => {
      const before = service.getSpecDraft();
      service.setPendingEdit('mit-001', 'Uncommitted edit');
      service.cancel();
      const after = service.getSpecDraft();
      expect(after).toEqual(before);
    });

    it('preserves existing decisions after cancel', async () => {
      await service.accept('mit-002');
      const decisionsBefore = service.getDecisions();
      service.setPendingEdit('mit-001', 'Pending');
      service.cancel();
      expect(service.getDecisions()).toEqual(decisionsBefore);
    });
  });

  describe('confirmEdit()', () => {
    it('applies the pending edit when confirmed', async () => {
      service.setPendingEdit('mit-001', 'Confirmed edit text');
      const result = await service.confirmEdit();
      expect(result).not.toBeNull();
      expect(result!.apiSurface).toBe('Confirmed edit text');
    });

    it('clears pending state after confirmation', async () => {
      service.setPendingEdit('mit-001', 'To confirm');
      await service.confirmEdit();
      expect(service.getPendingEdit()).toBeNull();
    });

    it('returns null when no pending edit exists', async () => {
      const result = await service.confirmEdit();
      expect(result).toBeNull();
    });
  });
});

describe('determineMitigationTargetSection', () => {
  it('maps API-related content to apiSurface', () => {
    const mit = createTestMitigation({
      riskTitle: 'API endpoint vulnerability',
      description: 'Fix the REST endpoint',
    });
    expect(determineMitigationTargetSection(mit)).toBe('apiSurface');
  });

  it('maps data/schema-related content to dataModel', () => {
    const mit = createTestMitigation({
      riskTitle: 'Schema validation gap',
      description: 'Add database index for performance',
    });
    expect(determineMitigationTargetSection(mit)).toBe('dataModel');
  });

  it('maps architecture/component content to proposedArchitecture', () => {
    const mit = createTestMitigation({
      riskTitle: 'Service resilience',
      description: 'Add circuit breaker component to the architecture',
    });
    expect(determineMitigationTargetSection(mit)).toBe('proposedArchitecture');
  });

  it('maps assumption/constraint content to assumptions', () => {
    const mit = createTestMitigation({
      riskTitle: 'Missing assumption about latency',
      description: 'Document the constraint on network latency',
    });
    expect(determineMitigationTargetSection(mit)).toBe('assumptions');
  });

  it('defaults to overview for general content', () => {
    const mit = createTestMitigation({
      riskTitle: 'General concern',
      description: 'Improve overall quality',
    });
    expect(determineMitigationTargetSection(mit)).toBe('overview');
  });
});
