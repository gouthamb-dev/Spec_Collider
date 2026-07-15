import * as fc from 'fast-check';
import type { SpecDraft, Risk, Mitigation, ModerationDecision, ActivityEntry, Session, VersionedArtifact } from '../src/types/domain.ts';
import type { MCPConnection, MCPConnectionState, MCPData } from '../src/types/mcp.ts';
import type { AgentRole } from '../src/types/streaming.ts';

// === Primitive Generators ===

/**
 * Arbitrary string within specified length bounds.
 * Generates printable unicode strings constrained to [minLen, maxLen].
 */
export function arbInputText(minLen: number = 10, maxLen: number = 5000): fc.Arbitrary<string> {
  return fc.string({ minLength: minLen, maxLength: maxLen });
}

// === Domain Object Generators ===

/**
 * Arbitrary valid SpecDraft with all five required sections populated as non-empty strings.
 */
export function arbSpecDraft(): fc.Arbitrary<SpecDraft> {
  return fc.record({
    overview: fc.string({ minLength: 1, maxLength: 500 }),
    proposedArchitecture: fc.string({ minLength: 1, maxLength: 500 }),
    dataModel: fc.string({ minLength: 1, maxLength: 500 }),
    apiSurface: fc.string({ minLength: 1, maxLength: 500 }),
    assumptions: fc.string({ minLength: 1, maxLength: 500 }),
    lastModified: fc.nat(),
    version: fc.nat({ max: 100 }),
  });
}

/**
 * Arbitrary valid Risk with correct enum values for category and severity.
 */
export function arbRisk(): fc.Arbitrary<Risk> {
  return fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 200 }),
    category: fc.constantFrom('scalability', 'security', 'reliability', 'edge_case', 'missing_assumption') as fc.Arbitrary<Risk['category']>,
    severity: fc.constantFrom('critical', 'high', 'medium', 'low') as fc.Arbitrary<Risk['severity']>,
    description: fc.string({ minLength: 1, maxLength: 1000 }),
    affectedComponents: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
    evidence: fc.string({ minLength: 1, maxLength: 500 }),
    isChaosRound: fc.boolean(),
    createdAt: fc.nat(),
  });
}

/**
 * Arbitrary valid Mitigation referencing a Risk.
 * If riskId is provided, uses that; otherwise generates a random UUID.
 */
export function arbMitigation(riskId?: string): fc.Arbitrary<Mitigation> {
  return fc.record({
    id: fc.uuid(),
    riskId: riskId ? fc.constant(riskId) : fc.uuid(),
    riskTitle: fc.string({ minLength: 1, maxLength: 200 }),
    responseType: fc.constantFrom('fix', 'trade_off', 'accepted_risk') as fc.Arbitrary<Mitigation['responseType']>,
    description: fc.string({ minLength: 1, maxLength: 1000 }),
    technologies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
    tradeOffs: fc.array(fc.string({ minLength: 1, maxLength: 200 }), { maxLength: 3 }),
    mcpEvidence: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
    createdAt: fc.nat(),
  });
}

/**
 * Arbitrary valid ModerationDecision with random action type.
 */
export function arbModerationDecision(): fc.Arbitrary<ModerationDecision> {
  return fc.oneof(
    // accepted decision
    fc.record({
      id: fc.uuid(),
      mitigationId: fc.uuid(),
      action: fc.constant('accepted' as const),
      reason: fc.constant(undefined),
      modifiedText: fc.constant(undefined),
      specDraftSectionModified: fc.constantFrom('overview', 'proposedArchitecture', 'dataModel', 'apiSurface', 'assumptions'),
      timestamp: fc.nat(),
    }),
    // rejected decision
    fc.record({
      id: fc.uuid(),
      mitigationId: fc.uuid(),
      action: fc.constant('rejected' as const),
      reason: fc.string({ minLength: 1, maxLength: 1000 }),
      modifiedText: fc.constant(undefined),
      specDraftSectionModified: fc.constantFrom('overview', 'proposedArchitecture', 'dataModel', 'apiSurface', 'assumptions'),
      timestamp: fc.nat(),
    }),
    // edited decision
    fc.record({
      id: fc.uuid(),
      mitigationId: fc.uuid(),
      action: fc.constant('edited' as const),
      reason: fc.constant(undefined),
      modifiedText: fc.string({ minLength: 1, maxLength: 5000 }),
      specDraftSectionModified: fc.constantFrom('overview', 'proposedArchitecture', 'dataModel', 'apiSurface', 'assumptions'),
      timestamp: fc.nat(),
    }),
  );
}

/**
 * Arbitrary valid ActivityEntry with random contributor and entry type.
 */
export function arbActivityEntry(): fc.Arbitrary<ActivityEntry> {
  return fc.record({
    id: fc.uuid(),
    type: fc.constantFrom('idea_submitted', 'risk_identified', 'mitigation_proposed', 'decision_made', 'chaos_triggered') as fc.Arbitrary<ActivityEntry['type']>,
    contributor: fc.constantFrom('user', 'red_team_agent', 'architect_agent') as fc.Arbitrary<ActivityEntry['contributor']>,
    content: fc.string({ minLength: 1, maxLength: 500 }),
    timestamp: fc.nat(),
    metadata: fc.constant({} as Record<string, unknown>),
    streamComplete: fc.boolean(),
    mcpGrounded: fc.boolean(),
    partiallyGrounded: fc.boolean(),
    unavailableProviders: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
  });
}

/**
 * Arbitrary full Session with random but consistent state.
 */
export function arbSession(): fc.Arbitrary<Session> {
  return fc.record({
    id: fc.uuid(),
    createdAt: fc.nat(),
    updatedAt: fc.nat(),
    specDraft: arbSpecDraft(),
    activityFeed: fc.array(arbActivityEntry(), { maxLength: 10 }),
    moderationHistory: fc.array(arbModerationDecision(), { maxLength: 5 }),
    artifacts: fc.array(arbVersionedArtifact(), { maxLength: 3 }),
    mcpConnections: fc.array(arbMCPConnectionState(), { maxLength: 5 }),
    status: fc.constantFrom('active', 'finalized') as fc.Arbitrary<Session['status']>,
  });
}

/**
 * Arbitrary valid AgentContext for a specific agent role.
 * Constructs an isolated context with only the agent's own system prompt.
 */
export function arbAgentContext(role?: AgentRole): fc.Arbitrary<{
  systemPrompt: string;
  specDraft: SpecDraft;
  activityHistory: ActivityEntry[];
  mcpContext: MCPData[];
}> {
  const agentRole = role
    ? fc.constant(role)
    : fc.constantFrom('red_team_agent', 'architect_agent') as fc.Arbitrary<AgentRole>;

  return agentRole.chain((selectedRole) =>
    fc.record({
      systemPrompt: fc.constant(
        selectedRole === 'red_team_agent'
          ? 'You are a Red Team security analyst. Identify risks and vulnerabilities.'
          : 'You are an Architect. Propose mitigations for identified risks.'
      ),
      specDraft: arbSpecDraft(),
      activityHistory: fc.array(arbActivityEntry(), { maxLength: 10 }),
      mcpContext: fc.array(arbMCPData(), { maxLength: 3 }),
    })
  );
}

/**
 * Arbitrary valid MCPConnection with random status.
 */
export function arbMCPConnection(): fc.Arbitrary<MCPConnection> {
  return fc.record({
    id: fc.uuid(),
    config: fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      uri: fc.webUrl(),
      capabilities: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
    }),
    status: fc.constantFrom('connected', 'disconnected', 'error', 'connected_no_data') as fc.Arbitrary<MCPConnection['status']>,
    connectedAt: fc.option(fc.nat(), { nil: undefined }),
    lastError: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  });
}

/**
 * Arbitrary viewport width in realistic range (320–3840 pixels).
 */
export function arbViewportWidth(): fc.Arbitrary<number> {
  return fc.integer({ min: 320, max: 3840 });
}

// === Internal Helper Generators ===

function arbMCPConnectionState(): fc.Arbitrary<MCPConnectionState> {
  return fc.record({
    connectionId: fc.uuid(),
    providerName: fc.string({ minLength: 1, maxLength: 50 }),
    status: fc.constantFrom('connected', 'disconnected', 'error', 'connected_no_data') as fc.Arbitrary<MCPConnectionState['status']>,
  });
}

function arbMCPData(): fc.Arbitrary<MCPData> {
  return fc.record({
    providerId: fc.uuid(),
    providerName: fc.string({ minLength: 1, maxLength: 50 }),
    data: fc.constant({} as Record<string, unknown>),
    retrievedAt: fc.nat(),
  });
}

function arbVersionedArtifact(): fc.Arbitrary<VersionedArtifact> {
  return fc.record({
    artifactId: fc.uuid(),
    type: fc.constantFrom('requirements', 'design', 'tasks', 'adr', 'steering_rules') as fc.Arbitrary<VersionedArtifact['type']>,
    versions: fc.array(
      fc.record({
        version: fc.nat({ max: 50 }),
        content: fc.string({ minLength: 1, maxLength: 200 }),
        generatedAt: fc.nat(),
      }),
      { minLength: 1, maxLength: 5 }
    ),
    currentVersion: fc.nat({ max: 50 }),
  });
}
