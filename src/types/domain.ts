export interface SpecDraft {
  overview: string;
  proposedArchitecture: string;
  dataModel: string;
  apiSurface: string;
  assumptions: string;
  lastModified: number;
  version: number;
}

export interface Risk {
  id: string;
  title: string;
  category: 'scalability' | 'security' | 'reliability' | 'edge_case' | 'missing_assumption';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedComponents: string[];
  evidence: string;
  isChaosRound: boolean;
  createdAt: number;
}

export interface Mitigation {
  id: string;
  riskId: string;
  riskTitle: string;
  responseType: 'fix' | 'trade_off' | 'accepted_risk';
  description: string;
  technologies: string[];
  tradeOffs: string[];
  mcpEvidence?: string;
  createdAt: number;
}

export interface ModerationDecision {
  id: string;
  mitigationId: string;
  action: 'accepted' | 'rejected' | 'edited';
  reason?: string;
  modifiedText?: string;
  specDraftSectionModified: string;
  timestamp: number;
}

export interface ActivityEntry {
  id: string;
  type: 'idea_submitted' | 'risk_identified' | 'mitigation_proposed' | 'decision_made' | 'chaos_triggered';
  contributor: 'user' | 'red_team_agent' | 'architect_agent';
  content: string;
  timestamp: number;
  metadata: Record<string, unknown>;
  streamComplete: boolean;
  mcpGrounded: boolean;
  partiallyGrounded: boolean;
  unavailableProviders: string[];
}

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  specDraft: SpecDraft;
  activityFeed: ActivityEntry[];
  moderationHistory: ModerationDecision[];
  artifacts: VersionedArtifact[];
  mcpConnections: MCPConnectionState[];
  status: 'active' | 'finalized';
}

export interface Artifact {
  id: string;
  type: 'requirements' | 'design' | 'tasks' | 'adr' | 'steering_rules';
  content: string;
  generatedAt: number;
}

export interface VersionedArtifact {
  artifactId: string;
  type: Artifact['type'];
  versions: ArtifactVersion[];
  currentVersion: number;
}

export interface ArtifactVersion {
  version: number;
  content: string;
  generatedAt: number;
}

// Re-import for Session usage
import type { MCPConnectionState } from './mcp.ts';
