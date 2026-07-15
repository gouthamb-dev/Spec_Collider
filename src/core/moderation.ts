import type { SpecDraft, Mitigation, ModerationDecision } from '../types/domain.ts';
import type { ConflictResult } from '../types/ui.ts';
import { validateRejectionReason, validateEditText } from './validation.ts';

/**
 * Valid section keys of a SpecDraft that can be targeted by a Mitigation.
 */
export type SpecDraftSection = keyof Pick<
  SpecDraft,
  'overview' | 'proposedArchitecture' | 'dataModel' | 'apiSurface' | 'assumptions'
>;

export const SPEC_DRAFT_SECTIONS: SpecDraftSection[] = [
  'overview',
  'proposedArchitecture',
  'dataModel',
  'apiSurface',
  'assumptions',
];

/**
 * Determines which SpecDraft section a Mitigation targets based on its content.
 * Uses keyword heuristics from the mitigation's description and riskTitle.
 */
export function determineMitigationTargetSection(mitigation: Mitigation): SpecDraftSection {
  const text = `${mitigation.riskTitle} ${mitigation.description}`.toLowerCase();

  if (text.includes('api') || text.includes('endpoint') || text.includes('route') || text.includes('rest') || text.includes('graphql')) {
    return 'apiSurface';
  }
  if (text.includes('data') || text.includes('schema') || text.includes('model') || text.includes('database') || text.includes('entity')) {
    return 'dataModel';
  }
  if (text.includes('architecture') || text.includes('component') || text.includes('service') || text.includes('infrastructure') || text.includes('deploy')) {
    return 'proposedArchitecture';
  }
  if (text.includes('assumption') || text.includes('constraint') || text.includes('prerequisite') || text.includes('dependency')) {
    return 'assumptions';
  }
  // Default to overview for general mitigations
  return 'overview';
}

/**
 * Generates a unique ID for a moderation decision.
 */
function generateDecisionId(): string {
  return `decision-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * ModerationService implements the IModerationFlow interface.
 * Manages moderation decisions (accept, reject, edit) for Mitigations,
 * applies changes to the SpecDraft, and detects conflicts.
 */
export class ModerationService {
  private specDraft: SpecDraft;
  private mitigations: Mitigation[];
  private decisions: ModerationDecision[];
  private pendingEdit: { mitigationId: string; modifiedText: string } | null = null;

  constructor(
    specDraft: SpecDraft,
    mitigations: Mitigation[],
    decisions: ModerationDecision[] = []
  ) {
    this.specDraft = { ...specDraft };
    this.mitigations = [...mitigations];
    this.decisions = [...decisions];
  }

  /**
   * Returns the current SpecDraft state.
   */
  getSpecDraft(): SpecDraft {
    return { ...this.specDraft };
  }

  /**
   * Returns all recorded moderation decisions.
   */
  getDecisions(): ModerationDecision[] {
    return [...this.decisions];
  }

  /**
   * Accept a Mitigation: apply its proposed change to the targeted SpecDraft section,
   * record a ModerationDecision with action='accepted' and current timestamp.
   */
  async accept(mitigationId: string): Promise<SpecDraft> {
    const mitigation = this.findMitigation(mitigationId);
    const targetSection = determineMitigationTargetSection(mitigation);

    // Apply the mitigation's description to the target section
    this.specDraft = {
      ...this.specDraft,
      [targetSection]: mitigation.description,
      lastModified: Date.now(),
      version: this.specDraft.version + 1,
    };

    // Record the decision
    const decision: ModerationDecision = {
      id: generateDecisionId(),
      mitigationId,
      action: 'accepted',
      specDraftSectionModified: targetSection,
      timestamp: Date.now(),
    };
    this.decisions.push(decision);

    return this.getSpecDraft();
  }

  /**
   * Reject a Mitigation: validate the reason, record the decision, preserve SpecDraft unchanged.
   * Throws if reason validation fails.
   */
  async reject(mitigationId: string, reason: string): Promise<void> {
    // Validate mitigation exists
    this.findMitigation(mitigationId);

    // Validate the rejection reason
    const validation = validateRejectionReason(reason);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Determine which section is associated (for recording)
    const mitigation = this.findMitigation(mitigationId);
    const targetSection = determineMitigationTargetSection(mitigation);

    // Record the decision without modifying the SpecDraft
    const decision: ModerationDecision = {
      id: generateDecisionId(),
      mitigationId,
      action: 'rejected',
      reason,
      specDraftSectionModified: targetSection,
      timestamp: Date.now(),
    };
    this.decisions.push(decision);
  }

  /**
   * Edit a Mitigation: validate text, apply the modified text to the targeted SpecDraft section.
   * Requires user confirmation (simulated by calling confirmEdit after edit).
   * Throws if text validation fails.
   */
  async edit(mitigationId: string, modifiedText: string): Promise<SpecDraft> {
    // Validate mitigation exists
    const mitigation = this.findMitigation(mitigationId);

    // Validate the modified text
    const validation = validateEditText(modifiedText);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const targetSection = determineMitigationTargetSection(mitigation);

    // Apply the modified text to the target section
    this.specDraft = {
      ...this.specDraft,
      [targetSection]: modifiedText,
      lastModified: Date.now(),
      version: this.specDraft.version + 1,
    };

    // Record the decision
    const decision: ModerationDecision = {
      id: generateDecisionId(),
      mitigationId,
      action: 'edited',
      modifiedText,
      specDraftSectionModified: targetSection,
      timestamp: Date.now(),
    };
    this.decisions.push(decision);

    return this.getSpecDraft();
  }

  /**
   * Check if a Mitigation conflicts with a prior accepted decision.
   * A conflict exists when the Mitigation targets a section that was already
   * modified by a previously accepted decision.
   */
  checkConflict(mitigationId: string, _specDraft: SpecDraft): ConflictResult {
    const mitigation = this.findMitigation(mitigationId);
    const targetSection = determineMitigationTargetSection(mitigation);

    // Find any prior accepted or edited decision that modified the same section
    const conflictingDecision = this.decisions.find(
      (d) =>
        (d.action === 'accepted' || d.action === 'edited') &&
        d.specDraftSectionModified === targetSection &&
        d.mitigationId !== mitigationId
    );

    if (conflictingDecision) {
      return {
        hasConflict: true,
        conflictingDecision,
        affectedSection: targetSection,
      };
    }

    return { hasConflict: false };
  }

  /**
   * Cancel: discard any uncommitted pending state, preserve SpecDraft unchanged.
   * Returns the Mitigation controls to their initial state.
   */
  cancel(): void {
    this.pendingEdit = null;
  }

  /**
   * Set a pending edit for user confirmation flow.
   * The user must call confirmEdit() to apply, or cancel() to discard.
   */
  setPendingEdit(mitigationId: string, modifiedText: string): void {
    this.pendingEdit = { mitigationId, modifiedText };
  }

  /**
   * Get the current pending edit if one exists.
   */
  getPendingEdit(): { mitigationId: string; modifiedText: string } | null {
    return this.pendingEdit ? { ...this.pendingEdit } : null;
  }

  /**
   * Confirm and apply the pending edit.
   * Returns the updated SpecDraft or null if no pending edit exists.
   */
  async confirmEdit(): Promise<SpecDraft | null> {
    if (!this.pendingEdit) {
      return null;
    }
    const { mitigationId, modifiedText } = this.pendingEdit;
    this.pendingEdit = null;
    return this.edit(mitigationId, modifiedText);
  }

  /**
   * Look up a Mitigation by ID. Throws if not found.
   */
  private findMitigation(mitigationId: string): Mitigation {
    const mitigation = this.mitigations.find((m) => m.id === mitigationId);
    if (!mitigation) {
      throw new Error(`Mitigation not found: ${mitigationId}`);
    }
    return mitigation;
  }
}
