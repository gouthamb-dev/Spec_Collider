import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatSSEChunk, parseSSEChunk } from '../../infra/lambda/sse.ts';

describe('Feature: bedrock-deployment, Property 1: SSE round-trip preserves content', () => {
  /**
   * Validates: Requirements 1.2, 2.3
   *
   * For any arbitrary string content and boolean done,
   * parseSSEChunk(formatSSEChunk(content, done)) returns { content, done }.
   */

  it('round-trip preserves content and done flag for any string and boolean', () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), (content, done) => {
        const formatted = formatSSEChunk(content, done);
        const parsed = parseSSEChunk(formatted);
        expect(parsed).not.toBeNull();
        expect(parsed!.content).toBe(content);
        expect(parsed!.done).toBe(done);
      }),
      { numRuns: 100 }
    );
  });
});
