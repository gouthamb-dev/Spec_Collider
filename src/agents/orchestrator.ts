import type { SpecDraft, ActivityEntry } from '../types/domain.ts';
import type { MCPData } from '../types/mcp.ts';
import type { StreamChunk, AgentRole } from '../types/streaming.ts';

// === Agent Context (isolation-aware) ===

export interface AgentContext {
  systemPrompt: string;
  specDraft: SpecDraft;
  activityHistory: ActivityEntry[];
  mcpContext: MCPData[];
}

// === Orchestrator Interface ===

export interface IAgentOrchestrator {
  invokeRedTeam(context: AgentContext): AsyncGenerator<StreamChunk>;
  invokeArchitect(context: AgentContext): AsyncGenerator<StreamChunk>;
  invokeChaos(context: AgentContext): AsyncGenerator<StreamChunk>;
}

// === Configuration ===

export interface AgentOrchestratorConfig {
  endpointUrl: string;
  redTeamSystemPrompt: string;
  architectSystemPrompt: string;
  timeoutMs?: number;
}

// === Timeout Error ===

export class AgentTimeoutError extends Error {
  public readonly role: AgentRole;
  public readonly retryable: boolean;

  constructor(role: AgentRole) {
    super(`Agent ${role} timed out after 30 seconds`);
    this.name = 'AgentTimeoutError';
    this.role = role;
    this.retryable = true;
  }
}

// === Default System Prompts (separate, independent configurations) ===

export const DEFAULT_RED_TEAM_PROMPT = `You are a Red Team security and reliability analyst. Your role is to aggressively review software architecture proposals and identify risks.

You MUST produce outputs that exclusively contain Risks — flaws, failure modes, scalability concerns, security vulnerabilities, and missing assumptions.

You MUST NOT produce Mitigations, solutions, or design alternatives. That is the Architect's role.

Structure each Risk with: title, category (scalability | security | reliability | edge_case | missing_assumption), severity (critical | high | medium | low), description, affected_components, and evidence.`;

export const DEFAULT_ARCHITECT_PROMPT = `You are an Architect Agent. Your role is to propose mitigations, trade-offs, and safer design alternatives in response to identified risks.

You MUST produce outputs that exclusively contain Mitigations — solutions, trade-offs, and design improvements.

You MUST NOT produce Risks, attacks, or failure-mode analyses. That is the Red Team's role.

Structure each Mitigation with: riskId, riskTitle, responseType (fix | trade_off | accepted_risk), description, and technologies (specific named technologies or patterns).`;

// === Helper: Build user message from context (never includes system prompt content) ===

function buildUserMessage(context: AgentContext): string {
  const sections: string[] = [];

  // Spec Draft section
  sections.push('## Current Spec Draft\n');
  sections.push(`### Overview\n${context.specDraft.overview}\n`);
  sections.push(`### Proposed Architecture\n${context.specDraft.proposedArchitecture}\n`);
  sections.push(`### Data Model\n${context.specDraft.dataModel}\n`);
  sections.push(`### API Surface\n${context.specDraft.apiSurface}\n`);
  sections.push(`### Assumptions\n${context.specDraft.assumptions}\n`);

  // Activity History section (shared feed, sanitized as data only)
  if (context.activityHistory.length > 0) {
    sections.push('## Activity History\n');
    for (const entry of context.activityHistory) {
      sections.push(`- [${entry.type}] (${entry.contributor}): ${entry.content}`);
    }
    sections.push('');
  }

  // MCP Context section (external data)
  if (context.mcpContext.length > 0) {
    sections.push('## External Context (MCP Providers)\n');
    for (const data of context.mcpContext) {
      sections.push(`### ${data.providerName}`);
      sections.push(JSON.stringify(data.data, null, 2));
      sections.push('');
    }
  }

  return sections.join('\n');
}

// === Orchestrator Implementation ===

export class AgentOrchestrator implements IAgentOrchestrator {
  private readonly config: AgentOrchestratorConfig;
  private readonly timeoutMs: number;

  constructor(config: AgentOrchestratorConfig) {
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  /**
   * Invoke the Red Team Agent with isolated context.
   * Context isolation: uses ONLY the red team system prompt — never the architect's.
   */
  async *invokeRedTeam(context: AgentContext): AsyncGenerator<StreamChunk> {
    yield* this.invokeAgent(context, 'red_team_agent');
  }

  /**
   * Invoke the Architect Agent with isolated context.
   * Context isolation: uses ONLY the architect system prompt — never the red team's.
   */
  async *invokeArchitect(context: AgentContext): AsyncGenerator<StreamChunk> {
    yield* this.invokeAgent(context, 'architect_agent');
  }

  /**
   * Invoke the Red Team Agent in chaos mode (re-evaluation of all sections
   * for catastrophic failures, cascading failures, and adversarial patterns).
   * Uses the same red team prompt with a chaos-specific user message prefix.
   */
  async *invokeChaos(context: AgentContext): AsyncGenerator<StreamChunk> {
    const chaosContext: AgentContext = {
      ...context,
      systemPrompt: context.systemPrompt,
    };
    yield* this.invokeAgent(chaosContext, 'red_team_agent', true);
  }

  /**
   * Core agent invocation with streaming, timeout, and context isolation.
   *
   * CONTEXT ISOLATION (Req 10.2):
   * - The system prompt is sent as-is from the AgentContext
   * - It is NEVER concatenated with or derived from activityHistory content
   * - The other agent's prompt/config is never accessible
   *
   * PROMPT INJECTION RESISTANCE (Req 10.6):
   * - The systemPrompt is placed in the system role message, separate from user content
   * - Activity history is treated as data in the user message only
   * - No parsing or interpolation of activity content into the system prompt
   */
  private async *invokeAgent(
    context: AgentContext,
    role: AgentRole,
    isChaos: boolean = false,
  ): AsyncGenerator<StreamChunk> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const userMessage = isChaos
        ? `[CHAOS ROUND] Re-evaluate ALL sections for catastrophic failure scenarios, cascading failures, and adversarial usage patterns. Label each risk as belonging to the chaos round.\n\n${buildUserMessage(context)}`
        : buildUserMessage(context);

      // Request body: messages contains just the user message, system prompt
      // is sent separately. System prompt is isolated — it comes directly from
      // the context and is never modified based on activityHistory content (Req 10.6)
      const response = await fetch(this.config.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: userMessage }],
          system: context.systemPrompt,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorBody = await response.json() as { error?: string };
          if (errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch {
          // If we can't parse the error body, use statusText
        }
        throw new Error(`API error: ${response.status} ${errorMessage}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Emit final done chunk
          yield {
            content: '',
            done: true,
            source: role,
            timestamp: Date.now(),
          };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield {
              content: '',
              done: true,
              source: role,
              timestamp: Date.now(),
            };
            return;
          }

          try {
            const parsed = JSON.parse(data) as {
              content?: string;
              done?: boolean;
            };
            if (parsed.done) {
              yield {
                content: '',
                done: true,
                source: role,
                timestamp: Date.now(),
              };
              return;
            }
            const content = parsed.content;
            if (content) {
              yield {
                content,
                done: false,
                source: role,
                timestamp: Date.now(),
              };
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    } catch (error: unknown) {
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        throw new AgentTimeoutError(role);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// === Factory: Create orchestrator with proper context isolation ===

/**
 * Creates an AgentContext for a specific role, ensuring context isolation.
 *
 * CRITICAL (Req 10.2): Each agent receives ONLY its own system prompt.
 * The other agent's prompt, internal reasoning, or configuration is never included.
 *
 * CRITICAL (Req 10.6): The system prompt remains unchanged regardless of what's
 * in activityHistory. It is stored as-is, not concatenated with or derived from
 * activity data.
 */
export function buildAgentContext(
  role: AgentRole,
  specDraft: SpecDraft,
  activityHistory: ActivityEntry[],
  mcpContext: MCPData[],
  config: AgentOrchestratorConfig,
): AgentContext {
  // Select ONLY the system prompt for the requested role (Req 10.1, 10.2)
  const systemPrompt = role === 'red_team_agent'
    ? config.redTeamSystemPrompt
    : config.architectSystemPrompt;

  return {
    systemPrompt,
    specDraft,
    activityHistory,
    mcpContext,
  };
}
