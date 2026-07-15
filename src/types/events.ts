import type { SpecDraft, Risk, Mitigation, ModerationDecision, Artifact } from './domain.ts';
import type { ConnectionStatus } from './ui.ts';
import type { AgentRole } from './streaming.ts';

export type WorkspaceEvent =
  | { type: 'idea_submitted'; payload: { text: string; timestamp: number } }
  | { type: 'spec_draft_generated'; payload: { draft: SpecDraft } }
  | { type: 'risk_identified'; payload: { risk: Risk; agentRole: 'red_team' } }
  | { type: 'mitigation_proposed'; payload: { mitigation: Mitigation; agentRole: 'architect' } }
  | { type: 'decision_made'; payload: { decision: ModerationDecision } }
  | { type: 'chaos_triggered'; payload: { timestamp: number } }
  | { type: 'artifact_generated'; payload: { artifact: Artifact } }
  | { type: 'mcp_status_changed'; payload: { connectionId: string; status: ConnectionStatus } }
  | { type: 'stream_chunk'; payload: { source: AgentRole; content: string } }
  | { type: 'error'; payload: { source: string; message: string; retryable: boolean } };
