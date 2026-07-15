import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

const mockSend = vi.fn();
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class {
    send = mockSend;
  },
  ConverseStreamCommand: class {
    input: any;
    constructor(input: any) { this.input = input; }
  },
}));

import { handler } from '../../infra/lambda/handler.ts';

describe('Feature: bedrock-deployment, Property 5: Invalid payload rejection', () => {
  /**
   * Validates: Requirements 7.5
   *
   * For any request body that either lacks a `messages` field or has a `messages`
   * field that is not an array, the Lambda handler SHALL respond with HTTP 400
   * and a JSON body equal to { "error": "messages field is required and must be an array" }.
   */

  it('returns 400 with exact error JSON for bodies missing messages or with non-array messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({ system: fc.string() }),
          fc.record({ messages: fc.anything().filter(m => !Array.isArray(m)) })
        ),
        async (testBody) => {
          const event = { body: JSON.stringify(testBody) } as any;
          const result = await handler(event);

          expect(result.statusCode).toBe(400);
          expect(JSON.parse(result.body!)).toEqual({
            error: 'messages field is required and must be an array',
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns 400 for completely empty body (no messages field)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ system: fc.string() }, { requiredKeys: [] }),
        async (testBody) => {
          const event = { body: JSON.stringify(testBody) } as any;
          const result = await handler(event);

          expect(result.statusCode).toBe(400);
          expect(JSON.parse(result.body!)).toEqual({
            error: 'messages field is required and must be an array',
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});


describe('Feature: bedrock-deployment, Property 2: Error responses are well-formed', () => {
  /**
   * Validates: Requirements 1.4
   *
   * For any error thrown by the Bedrock client (with any error message string),
   * the Lambda handler SHALL respond with a non-2xx HTTP status code and a JSON body
   * containing an `error` field whose value is a non-empty string.
   */

  it('returns non-2xx status and JSON body with non-empty error string when Bedrock client throws', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (errorMessage) => {
          mockSend.mockRejectedValueOnce(new Error(errorMessage));

          const event = {
            body: JSON.stringify({
              messages: [{ role: 'user', content: 'hello' }],
              system: 'You are a helpful assistant',
            }),
          } as any;

          const result = await handler(event);

          // Status code should NOT be in 200-299 range
          expect(result.statusCode).toBeGreaterThanOrEqual(300);

          // Body should be valid JSON with a non-empty error string
          const body = JSON.parse(result.body!);
          expect(typeof body.error).toBe('string');
          expect(body.error.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
