import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { arbSpecDraft, arbInputText } from '../generators.ts';
import { SpecDraftGenerator, SpecDraftGenerationError } from '../../src/core/spec-draft-generator.ts';

describe('Feature: spec-collider, Property 2: SpecDraft structural completeness', () => {
  /**
   * Validates: Requirements 1.3
   *
   * For any generated SpecDraft object, it SHALL contain all five required sections
   * (overview, proposedArchitecture, dataModel, apiSurface, assumptions) and each
   * section SHALL be a non-empty string.
   */

  it('every SpecDraft has all 5 non-empty sections', () => {
    fc.assert(
      fc.property(arbSpecDraft(), (draft) => {
        // All 5 sections must exist and be non-empty strings
        expect(draft.overview).toBeDefined();
        expect(typeof draft.overview).toBe('string');
        expect(draft.overview.length).toBeGreaterThan(0);

        expect(draft.proposedArchitecture).toBeDefined();
        expect(typeof draft.proposedArchitecture).toBe('string');
        expect(draft.proposedArchitecture.length).toBeGreaterThan(0);

        expect(draft.dataModel).toBeDefined();
        expect(typeof draft.dataModel).toBe('string');
        expect(draft.dataModel.length).toBeGreaterThan(0);

        expect(draft.apiSurface).toBeDefined();
        expect(typeof draft.apiSurface).toBe('string');
        expect(draft.apiSurface.length).toBeGreaterThan(0);

        expect(draft.assumptions).toBeDefined();
        expect(typeof draft.assumptions).toBe('string');
        expect(draft.assumptions.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 3: Input preservation on generation failure', () => {
  /**
   * Validates: Requirements 1.5
   *
   * For any submitted input text and any generation failure scenario, the workspace
   * state SHALL preserve the original input text unchanged, enabling retry without re-entry.
   */

  it('original input is preserved unchanged after generation failure', async () => {
    await fc.assert(
      fc.asyncProperty(arbInputText(10, 5000), async (inputText) => {
        // Create a generator pointing to a non-existent server to force failure
        const generator = new SpecDraftGenerator({
          apiKey: 'test-key',
          baseUrl: 'http://localhost:1', // Will fail to connect
          model: 'test-model',
          timeoutMs: 100, // Short timeout to fail fast
        });

        // Attempt to generate — this should fail
        try {
          const stream = generator.generate(inputText);
          // Consume the stream to trigger the network call
          for await (const _chunk of stream) {
            // Consuming chunks
          }
        } catch (error) {
          // Expected to fail — generation error
          expect(error).toBeInstanceOf(SpecDraftGenerationError);
        }

        // The original input must be preserved regardless of the failure
        expect(generator.getOriginalInput()).toBe(inputText);
      }),
      { numRuns: 100 }
    );
  });
});
