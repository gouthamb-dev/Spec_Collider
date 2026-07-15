import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { AgentOrchestrator } from '../../src/agents/orchestrator.ts';
import type { AgentOrchestratorConfig, AgentContext } from '../../src/agents/orchestrator.ts';

// === Test helpers ===

function makeTestConfig(): AgentOrchestratorConfig {
  return {
    endpointUrl: 'http://localhost:3000/converse',
    redTeamSystemPrompt: 'You are a red team agent.',
    architectSystemPrompt: 'You are an architect agent.',
    timeoutMs: 5000,
  };
}

function makeTestContext(): AgentContext {
  return {
    systemPrompt: 'test prompt',
    specDraft: {
      overview: '',
      proposedArchitecture: '',
      dataModel: '',
      apiSurface: '',
      assumptions: '',
      lastModified: 0,
      version: 1,
    },
    activityHistory: [],
    mcpContext: [],
  };
}

describe('Feature: bedrock-deployment, Property 3: Non-2xx status propagation', () => {
  /**
   * Validates: Requirements 2.5
   *
   * For any HTTP status code outside the 200-299 range and any error message string,
   * the AgentOrchestrator SHALL throw an Error whose message includes both the numeric
   * status code and the error text from the response body.
   */

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws an Error including both status code and error message for non-2xx responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 300, max: 599 }),
        fc.string({ minLength: 1 }),
        async (statusCode, errorMessage) => {
          // Mock fetch to return non-2xx with JSON error body
          globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: statusCode,
            statusText: 'Error',
            json: () => Promise.resolve({ error: errorMessage }),
          });

          const config = makeTestConfig();
          const orchestrator = new AgentOrchestrator(config);
          const context = makeTestContext();

          // Consume the async generator — it should throw
          let thrownError: Error | null = null;
          try {
            const generator = orchestrator.invokeRedTeam(context);
            // Exhaust the generator to trigger the fetch and error
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _chunk of generator) {
              // Should not yield any chunks
            }
          } catch (err) {
            thrownError = err as Error;
          }

          // Assert an error was thrown
          expect(thrownError).toBeInstanceOf(Error);
          // Error message must include the numeric status code
          expect(thrownError!.message).toContain(String(statusCode));
          // Error message must include the error text from the response body
          expect(thrownError!.message).toContain(errorMessage);
        }
      ),
      { numRuns: 100 }
    );
  });
});
