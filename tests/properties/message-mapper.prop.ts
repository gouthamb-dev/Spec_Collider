import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mapToBedrockMessages } from '../../infra/lambda/message-mapper.ts';
import type { FrontendMessage } from '../../infra/lambda/message-mapper.ts';

describe('Feature: bedrock-deployment, Property 4: Message mapping to Bedrock format', () => {
  /**
   * Validates: Requirements 7.1, 7.2
   *
   * For any non-empty array of frontend messages (each with a role and content string),
   * mapToBedrockMessages SHALL produce an array of equal length where each element has
   * `role` matching the input and `content` equal to `[{ text: inputContent }]`.
   */

  it('output array has equal length to input array', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            role: fc.constantFrom('user', 'assistant'),
            content: fc.string(),
          }),
          { minLength: 1 }
        ),
        (messages: FrontendMessage[]) => {
          const result = mapToBedrockMessages(messages);
          expect(result).toHaveLength(messages.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each element content is wrapped as [{ text: inputContent }]', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            role: fc.constantFrom('user', 'assistant'),
            content: fc.string(),
          }),
          { minLength: 1 }
        ),
        (messages: FrontendMessage[]) => {
          const result = mapToBedrockMessages(messages);
          for (let i = 0; i < messages.length; i++) {
            expect(result[i].content).toEqual([{ text: messages[i].content }]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each element role matches the input role', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            role: fc.constantFrom('user', 'assistant'),
            content: fc.string(),
          }),
          { minLength: 1 }
        ),
        (messages: FrontendMessage[]) => {
          const result = mapToBedrockMessages(messages);
          for (let i = 0; i < messages.length; i++) {
            expect(result[i].role).toBe(messages[i].role);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
