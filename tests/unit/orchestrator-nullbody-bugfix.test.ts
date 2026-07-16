import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgentOrchestrator,
  DEFAULT_RED_TEAM_PROMPT,
  DEFAULT_ARCHITECT_PROMPT,
  type AgentOrchestratorConfig,
  type AgentContext,
} from '../../src/agents/orchestrator.ts';
import type { SpecDraft } from '../../src/types/domain.ts';

/**
 * Bug Condition Exploration Tests: Orchestrator Null Body TypeError
 *
 * These tests confirm Bug 2: when response.body is null and response.text is
 * not available as a function, the orchestrator should throw
 * Error('Response body is null') but currently throws TypeError instead.
 *
 * Expected: These tests FAIL on unfixed code (confirming the bug exists).
 *
 * Validates: Requirements 1.2, 2.2
 */

function createMockConfig(): AgentOrchestratorConfig {
  return {
    endpointUrl: 'https://api.test.com/converse',
    redTeamSystemPrompt: DEFAULT_RED_TEAM_PROMPT,
    architectSystemPrompt: DEFAULT_ARCHITECT_PROMPT,
  };
}

function createMockSpecDraft(): SpecDraft {
  return {
    overview: 'Test overview',
    proposedArchitecture: 'Test architecture',
    dataModel: 'Test data model',
    apiSurface: 'Test API surface',
    assumptions: 'Test assumptions',
    lastModified: Date.now(),
    version: 1,
  };
}

describe('Orchestrator null body TypeError bug (exploration)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws Error("Response body is null") when body is null and no text property exists', async () => {
    /**
     * Bug Condition: response.body === null AND response has no text method.
     * Current behavior (unfixed): throws TypeError "response.text is not a function"
     * Expected behavior (fixed): throws Error('Response body is null')
     *
     * Validates: Requirements 1.2, 2.2
     */
    const config = createMockConfig();
    const orchestrator = new AgentOrchestrator(config);
    const context: AgentContext = {
      systemPrompt: config.redTeamSystemPrompt,
      specDraft: createMockSpecDraft(),
      activityHistory: [],
      mcpContext: [],
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: null,
      headers: new Headers(),
    });

    const generator = orchestrator.invokeRedTeam(context);

    await expect(generator.next()).rejects.toThrow('Response body is null');
  });

  it('throws Error("Response body is null") when body is null and text is undefined', async () => {
    /**
     * Bug Condition: response.body === null AND response.text === undefined.
     * Current behavior (unfixed): throws TypeError "response.text is not a function"
     * Expected behavior (fixed): throws Error('Response body is null')
     *
     * Validates: Requirements 1.2, 2.2
     */
    const config = createMockConfig();
    const orchestrator = new AgentOrchestrator(config);
    const context: AgentContext = {
      systemPrompt: config.redTeamSystemPrompt,
      specDraft: createMockSpecDraft(),
      activityHistory: [],
      mcpContext: [],
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: null,
      text: undefined,
      headers: new Headers(),
    });

    const generator = orchestrator.invokeRedTeam(context);

    await expect(generator.next()).rejects.toThrow('Response body is null');
  });
});
