import type { Session, Artifact, ModerationDecision } from '../types/domain.ts';
import type { ExportResult } from '../types/ui.ts';

/**
 * Options for artifact generation.
 */
export interface GenerateOptions {
  enableSteeringRules?: boolean;
}

/**
 * ArtifactGenerator implements the IArtifactGenerator interface.
 * Produces structured markdown artifacts from a finalized session's accepted state.
 */
export class ArtifactGenerator {
  /**
   * Generate all artifacts from the session's accepted state.
   *
   * Precondition: At least one accepted ModerationDecision must exist (Req 6.1).
   * Produces: requirements.md, design.md, tasks.md, adr.md, and optionally steering-rules.md (Req 6.2–6.6).
   */
  async generateAll(session: Session, options?: GenerateOptions): Promise<Artifact[]> {
    // Enforce finalize precondition: at least one accepted ModerationDecision required (Req 6.1)
    const acceptedDecisions = session.moderationHistory.filter(
      (d) => d.action === 'accepted'
    );

    if (acceptedDecisions.length === 0) {
      throw new Error(
        'Cannot finalize: at least one accepted moderation decision is required'
      );
    }

    const now = Date.now();
    const artifacts: Artifact[] = [];

    // Generate requirements.md (Req 6.2)
    artifacts.push({
      id: generateArtifactId('requirements'),
      type: 'requirements',
      content: this.generateRequirements(session, acceptedDecisions),
      generatedAt: now,
    });

    // Generate design.md (Req 6.3)
    artifacts.push({
      id: generateArtifactId('design'),
      type: 'design',
      content: this.generateDesign(session, acceptedDecisions),
      generatedAt: now,
    });

    // Generate tasks.md (Req 6.4)
    artifacts.push({
      id: generateArtifactId('tasks'),
      type: 'tasks',
      content: this.generateTasks(session, acceptedDecisions),
      generatedAt: now,
    });

    // Generate adr.md (Req 6.5)
    artifacts.push({
      id: generateArtifactId('adr'),
      type: 'adr',
      content: this.generateAdr(session),
      generatedAt: now,
    });

    // Generate steering-rules.md conditionally (Req 6.6)
    if (options?.enableSteeringRules) {
      artifacts.push({
        id: generateArtifactId('steering_rules'),
        type: 'steering_rules',
        content: this.generateSteeringRules(session, acceptedDecisions),
        generatedAt: now,
      });
    }

    return artifacts;
  }

  /**
   * Export artifacts to filesystem. Stub implementation — full logic in task 7.2.
   */
  async exportToFilesystem(_artifacts: Artifact[], _basePath: string): Promise<ExportResult> {
    return {
      success: true,
      writtenFiles: [],
      failedFiles: [],
    };
  }

  /**
   * Generate requirements.md content referencing all accepted requirements (Req 6.2).
   */
  private generateRequirements(
    session: Session,
    acceptedDecisions: ModerationDecision[]
  ): string {
    const lines: string[] = [
      '# Requirements',
      '',
      '## Overview',
      '',
      session.specDraft.overview,
      '',
      '## Accepted Requirements',
      '',
    ];

    for (const decision of acceptedDecisions) {
      const section = decision.specDraftSectionModified;
      const text = decision.modifiedText ?? decision.reason ?? section;
      lines.push(`- **${section}**: ${text}`);
    }

    lines.push('');
    lines.push('## Spec Draft Sections');
    lines.push('');
    lines.push('### Proposed Architecture');
    lines.push('');
    lines.push(session.specDraft.proposedArchitecture);
    lines.push('');
    lines.push('### Data Model');
    lines.push('');
    lines.push(session.specDraft.dataModel);
    lines.push('');
    lines.push('### API Surface');
    lines.push('');
    lines.push(session.specDraft.apiSurface);
    lines.push('');
    lines.push('### Assumptions');
    lines.push('');
    lines.push(session.specDraft.assumptions);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate design.md content with accepted mitigations incorporated (Req 6.3).
   */
  private generateDesign(
    session: Session,
    acceptedDecisions: ModerationDecision[]
  ): string {
    const lines: string[] = [
      '# Architecture Design',
      '',
      '## Overview',
      '',
      session.specDraft.overview,
      '',
      '## Architecture',
      '',
      session.specDraft.proposedArchitecture,
      '',
      '## Data Model',
      '',
      session.specDraft.dataModel,
      '',
      '## API Surface',
      '',
      session.specDraft.apiSurface,
      '',
      '## Accepted Mitigations',
      '',
    ];

    for (const decision of acceptedDecisions) {
      const mitigationId = decision.mitigationId;
      const section = decision.specDraftSectionModified;
      lines.push(`### Mitigation: ${mitigationId}`);
      lines.push('');
      lines.push(`- **Section**: ${section}`);
      if (decision.modifiedText) {
        lines.push(`- **Applied Change**: ${decision.modifiedText}`);
      }
      lines.push('');
    }

    lines.push('## Assumptions');
    lines.push('');
    lines.push(session.specDraft.assumptions);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate tasks.md with at least N tasks for N accepted mitigations (Req 6.4).
   * Each accepted mitigation produces at minimum one implementation task.
   */
  private generateTasks(
    _session: Session,
    acceptedDecisions: ModerationDecision[]
  ): string {
    const lines: string[] = [
      '# Implementation Tasks',
      '',
    ];

    let taskIndex = 1;
    for (const decision of acceptedDecisions) {
      const mitigationId = decision.mitigationId;
      const section = decision.specDraftSectionModified;
      lines.push(`## Task ${taskIndex}: Implement mitigation ${mitigationId}`);
      lines.push('');
      lines.push(`- **Target Section**: ${section}`);
      lines.push(`- **Decision**: ${decision.action}`);
      if (decision.modifiedText) {
        lines.push(`- **Details**: ${decision.modifiedText}`);
      }
      lines.push(`- **Status**: Pending`);
      lines.push('');
      taskIndex++;
    }

    return lines.join('\n');
  }

  /**
   * Generate adr.md with one ADR entry per trade-off decision (Req 6.5).
   * Includes both accepted and rejected trade-off decisions.
   */
  private generateAdr(session: Session): string {
    const lines: string[] = [
      '# Architecture Decision Records',
      '',
    ];

    // Find all trade-off decisions (accepted or rejected)
    const tradeOffDecisions = this.getTradeOffDecisions(session);

    if (tradeOffDecisions.length === 0) {
      lines.push('No trade-off decisions recorded.');
      lines.push('');
      return lines.join('\n');
    }

    let adrIndex = 1;
    for (const decision of tradeOffDecisions) {
      lines.push(`## ADR-${String(adrIndex).padStart(3, '0')}: ${decision.mitigationId}`);
      lines.push('');
      lines.push(`- **Status**: ${decision.action}`);
      lines.push(`- **Section**: ${decision.specDraftSectionModified}`);
      if (decision.reason) {
        lines.push(`- **Reason**: ${decision.reason}`);
      }
      if (decision.modifiedText) {
        lines.push(`- **Modified Text**: ${decision.modifiedText}`);
      }
      lines.push(`- **Date**: ${new Date(decision.timestamp).toISOString()}`);
      lines.push('');
      adrIndex++;
    }

    return lines.join('\n');
  }

  /**
   * Generate steering-rules.md encoding architecture decisions as reusable constraints (Req 6.6).
   */
  private generateSteeringRules(
    _session: Session,
    acceptedDecisions: ModerationDecision[]
  ): string {
    const lines: string[] = [
      '# Steering Rules',
      '',
      'Architecture decisions encoded as reusable constraints.',
      '',
    ];

    let ruleIndex = 1;
    for (const decision of acceptedDecisions) {
      const section = decision.specDraftSectionModified;
      lines.push(`## Rule ${ruleIndex}: ${section}`);
      lines.push('');
      if (decision.modifiedText) {
        lines.push(`- ${decision.modifiedText}`);
      } else {
        lines.push(`- Applied mitigation ${decision.mitigationId} to ${section}`);
      }
      lines.push('');
      ruleIndex++;
    }

    return lines.join('\n');
  }

  /**
   * Get all trade-off decisions from the session.
   * A trade-off decision is any moderation decision (accepted or rejected)
   * that corresponds to a mitigation with responseType='trade_off'.
   *
   * Since we may not have direct access to Mitigation objects,
   * we include all accepted and rejected decisions as potential ADR entries.
   * In a real system, we'd correlate with the mitigation's responseType.
   */
  private getTradeOffDecisions(session: Session): ModerationDecision[] {
    // Include all decisions (accepted or rejected) as ADR entries
    // per Req 6.5: "one ADR entry per trade-off decision (accepted or rejected)"
    return session.moderationHistory.filter(
      (d) => d.action === 'accepted' || d.action === 'rejected'
    );
  }
}

/**
 * Generate a unique artifact ID.
 */
function generateArtifactId(type: string): string {
  return `artifact-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
