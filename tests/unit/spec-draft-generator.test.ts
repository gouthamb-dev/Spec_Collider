import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SpecDraftGenerator,
  SpecDraftGenerationError,
  DuplicateSubmissionError,
} from '../../src/core/spec-draft-generator.ts';
import type { StreamChunk } from '../../src/types/streaming.ts';

// === Test Helpers ===

/**
 * Creates a mock SSE stream response from an array of content strings.
 */
function createMockSSEResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const sseLines = chunks.map(c => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`);
  sseLines.push('data: [DONE]\n\n');
  const fullBody = sseLines.join('');

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(fullBody));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/**
 * A well-formed spec draft AI output with all 5 sections.
 */
const VALID_SPEC_OUTPUT = `## Overview
This is the feature overview describing the purpose and value.

## Proposed Architecture
The system uses a microservices architecture with event-driven communication.

## Data Model
Users table with id, name, email fields. Events table with id, type, payload.

## API Surface
POST /api/features - Create a new feature
GET /api/features/:id - Get feature by ID

## Assumptions
Users have stable internet connections. The system handles up to 10k concurrent users.`;

/**
 * Collect all chunks from an async generator.
 */
async function collectChunks(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

// === Tests ===

describe('SpecDraftGenerator', () => {
  let generator: SpecDraftGenerator;

  beforeEach(() => {
    generator = new SpecDraftGenerator({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'test-model',
      timeoutMs: 5000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isGenerating()', () => {
    it('returns false initially', () => {
      expect(generator.isGenerating()).toBe(false);
    });

    it('returns false after generation completes', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createMockSSEResponse([VALID_SPEC_OUTPUT]),
      );

      await collectChunks(generator.generate('Build a feature for user authentication'));
      expect(generator.isGenerating()).toBe(false);
    });

    it('returns false after generation fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      try {
        await collectChunks(generator.generate('Build a feature for user authentication'));
      } catch {
        // expected
      }
      expect(generator.isGenerating()).toBe(false);
    });
  });

  describe('getOriginalInput()', () => {
    it('returns null initially', () => {
      expect(generator.getOriginalInput()).toBeNull();
    });

    it('preserves input text after successful generation', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createMockSSEResponse([VALID_SPEC_OUTPUT]),
      );

      const input = 'Build a user authentication system with OAuth2';
      await collectChunks(generator.generate(input));
      expect(generator.getOriginalInput()).toBe(input);
    });

    it('preserves input text after failed generation (Req 1.5)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const input = 'Build a notification service for real-time alerts';
      try {
        await collectChunks(generator.generate(input));
      } catch {
        // expected
      }
      expect(generator.getOriginalInput()).toBe(input);
    });
  });

  describe('getLastDraft()', () => {
    it('returns null initially', () => {
      expect(generator.getLastDraft()).toBeNull();
    });

    it('returns the parsed SpecDraft after successful generation', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createMockSSEResponse([VALID_SPEC_OUTPUT]),
      );

      await collectChunks(generator.generate('Build a feature for user authentication'));
      const draft = generator.getLastDraft();

      expect(draft).not.toBeNull();
      expect(draft!.overview).toContain('feature overview');
      expect(draft!.proposedArchitecture).toContain('microservices');
      expect(draft!.dataModel).toContain('Users table');
      expect(draft!.apiSurface).toContain('POST /api/features');
      expect(draft!.assumptions).toContain('stable internet');
      expect(draft!.version).toBe(1);
      expect(draft!.lastModified).toBeGreaterThan(0);
    });
  });

  describe('generate()', () => {
    it('streams content chunks with correct source and structure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createMockSSEResponse(['## Overview\nHello', ' world']),
      );

      // Manually generate partial output won't parse into 5 sections, so use valid output
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createMockSSEResponse([VALID_SPEC_OUTPUT]),
      );

      const chunks = await collectChunks(generator.generate('Build a feature for user authentication'));

      // Should have content chunks + done chunk
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // Content chunks should have correct source
      const contentChunks = chunks.filter(c => !c.done);
      for (const chunk of contentChunks) {
        expect(chunk.source).toBe('spec_generator');
        expect(chunk.done).toBe(false);
        expect(chunk.timestamp).toBeGreaterThan(0);
        expect(chunk.content.length).toBeGreaterThan(0);
      }

      // Final chunk should be done
      const doneChunk = chunks[chunks.length - 1];
      expect(doneChunk.done).toBe(true);
      expect(doneChunk.source).toBe('spec_generator');
    });

    it('throws DuplicateSubmissionError when generation is in progress (Req 1.6)', async () => {
      const generator = new SpecDraftGenerator({
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com/v1',
        model: 'test-model',
        timeoutMs: 50,
      });

      // Mock fetch that hangs and respects abort
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = options?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      // Start first generation — attach .catch immediately to prevent unhandled rejection
      const gen1 = generator.generate('First idea submission');
      const firstNextHandled = gen1.next().catch(() => {});

      // The generator is now in-progress
      expect(generator.isGenerating()).toBe(true);

      // Try to start a second generation — should throw DuplicateSubmissionError
      const gen2 = generator.generate('Second idea submission');
      await expect(gen2.next()).rejects.toThrow(DuplicateSubmissionError);

      // Wait for the first generator to time out and settle
      await firstNextHandled;
    }, 10000);

    it('throws SpecDraftGenerationError on API error response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
      );

      await expect(
        collectChunks(generator.generate('Build a feature for user authentication')),
      ).rejects.toThrow(SpecDraftGenerationError);
    });

    it('throws SpecDraftGenerationError when output lacks required sections', async () => {
      const incompleteOutput = `## Overview
Just an overview without other sections.`;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createMockSSEResponse([incompleteOutput]),
      );

      await expect(
        collectChunks(generator.generate('Build a feature')),
      ).rejects.toThrow(SpecDraftGenerationError);
    });

    it('throws SpecDraftGenerationError on timeout', async () => {
      const generator = new SpecDraftGenerator({
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com/v1',
        model: 'test-model',
        timeoutMs: 20, // Very short timeout for test
      });

      // Mock fetch that hangs for longer than the timeout, then rejects on abort
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = options?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      let thrownError: Error | undefined;
      try {
        await collectChunks(generator.generate('Build a feature for user authentication'));
      } catch (e) {
        thrownError = e as Error;
      }

      expect(thrownError).toBeInstanceOf(SpecDraftGenerationError);
      expect(thrownError!.message).toContain('timed out');
      expect(generator.isGenerating()).toBe(false);
    }, 10000);

    it('makes correct API request with proper headers and body', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createMockSSEResponse([VALID_SPEC_OUTPUT]),
      );

      await collectChunks(generator.generate('Build a payment processing system'));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.example.com/v1/chat/completions');
      expect(options?.method).toBe('POST');
      expect((options?.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
      expect((options?.headers as Record<string, string>)['Content-Type']).toBe('application/json');

      const body = JSON.parse(options?.body as string);
      expect(body.model).toBe('test-model');
      expect(body.stream).toBe(true);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toBe('Build a payment processing system');
    });

    it('validates all 5 sections are non-empty in generated SpecDraft (Req 1.3)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createMockSSEResponse([VALID_SPEC_OUTPUT]),
      );

      await collectChunks(generator.generate('Build a feature'));
      const draft = generator.getLastDraft()!;

      expect(draft.overview.length).toBeGreaterThan(0);
      expect(draft.proposedArchitecture.length).toBeGreaterThan(0);
      expect(draft.dataModel.length).toBeGreaterThan(0);
      expect(draft.apiSurface.length).toBeGreaterThan(0);
      expect(draft.assumptions.length).toBeGreaterThan(0);
    });

    it('allows subsequent generation after first completes', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(createMockSSEResponse([VALID_SPEC_OUTPUT]))
        .mockResolvedValueOnce(createMockSSEResponse([VALID_SPEC_OUTPUT]));

      await collectChunks(generator.generate('First idea'));
      expect(generator.isGenerating()).toBe(false);

      // Second generation should work fine
      await collectChunks(generator.generate('Second idea'));
      expect(generator.isGenerating()).toBe(false);
      expect(generator.getOriginalInput()).toBe('Second idea');
    });

    it('allows subsequent generation after first fails', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(createMockSSEResponse([VALID_SPEC_OUTPUT]));

      try {
        await collectChunks(generator.generate('First idea'));
      } catch {
        // expected
      }

      expect(generator.isGenerating()).toBe(false);
      // Should be able to retry
      await collectChunks(generator.generate('Retry idea'));
      expect(generator.getLastDraft()).not.toBeNull();
    });
  });
});
