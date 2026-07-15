import type { SpecDraft } from '../types/domain.ts';
import type { StreamChunk } from '../types/streaming.ts';

// === Configuration ===

export interface SpecDraftGeneratorConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

// === Errors ===

export class SpecDraftGenerationError extends Error {
  public readonly retryable: boolean;

  constructor(message: string, retryable: boolean = true) {
    super(message);
    this.name = 'SpecDraftGenerationError';
    this.retryable = retryable;
  }
}

export class DuplicateSubmissionError extends Error {
  constructor() {
    super('A generation is already in progress. Please wait for it to complete.');
    this.name = 'DuplicateSubmissionError';
  }
}

// === System Prompt ===

const SPEC_DRAFT_SYSTEM_PROMPT = `You are a software architecture specification generator. Given a user's feature idea, produce a structured specification document with exactly these 5 sections:

## Overview
A concise summary of what the feature does, its purpose, and its value proposition.

## Proposed Architecture
The high-level technical architecture including components, services, data flow, and technology choices.

## Data Model
The data structures, schemas, database tables, or state models needed to support the feature.

## API Surface
The public interfaces, endpoints, methods, events, or contracts exposed by the feature.

## Assumptions
Key assumptions made about the environment, constraints, dependencies, or user behavior.

RULES:
- Each section MUST be non-empty and contain substantive content.
- Use the exact section headers shown above (## Overview, ## Proposed Architecture, ## Data Model, ## API Surface, ## Assumptions).
- Write in clear, technical language appropriate for a software engineering audience.
- Be specific — name technologies, patterns, and concrete design choices.
- Do not include any content outside these 5 sections.`;

// === Section Parser ===

interface ParsedSections {
  overview: string;
  proposedArchitecture: string;
  dataModel: string;
  apiSurface: string;
  assumptions: string;
}

/**
 * Parse the accumulated AI output into the 5 structured sections.
 * Returns null if any section is missing or empty.
 */
function parseSections(rawText: string): ParsedSections | null {
  const sectionHeaders = [
    { key: 'overview' as const, pattern: /##\s*Overview/i },
    { key: 'proposedArchitecture' as const, pattern: /##\s*Proposed\s*Architecture/i },
    { key: 'dataModel' as const, pattern: /##\s*Data\s*Model/i },
    { key: 'apiSurface' as const, pattern: /##\s*API\s*Surface/i },
    { key: 'assumptions' as const, pattern: /##\s*Assumptions/i },
  ];

  const positions: Array<{ key: keyof ParsedSections; start: number }> = [];

  for (const header of sectionHeaders) {
    const match = rawText.match(header.pattern);
    if (!match || match.index === undefined) {
      return null;
    }
    // Content starts after the header line
    const headerEnd = rawText.indexOf('\n', match.index);
    positions.push({
      key: header.key,
      start: headerEnd === -1 ? match.index + match[0].length : headerEnd + 1,
    });
  }

  // Sort by position in document
  positions.sort((a, b) => a.start - b.start);

  const result: ParsedSections = {
    overview: '',
    proposedArchitecture: '',
    dataModel: '',
    apiSurface: '',
    assumptions: '',
  };

  for (let i = 0; i < positions.length; i++) {
    const current = positions[i];
    const next = positions[i + 1];
    const sectionContent = next
      ? rawText.slice(current.start, rawText.lastIndexOf('\n', next.start - 1) >= current.start
          ? rawText.search(sectionHeaders[sectionHeaders.findIndex(h => h.key === next.key)].pattern)
          : next.start)
      : rawText.slice(current.start);

    result[current.key] = sectionContent.trim();
  }

  // Re-parse more carefully: extract content between consecutive headers
  for (let i = 0; i < positions.length; i++) {
    const current = positions[i];
    const nextIndex = i + 1;
    let endPos: number;

    if (nextIndex < positions.length) {
      // Find the start of the next section header in the raw text
      const nextHeader = sectionHeaders.find(h => h.key === positions[nextIndex].key)!;
      const nextMatch = rawText.match(nextHeader.pattern);
      endPos = nextMatch!.index!;
    } else {
      endPos = rawText.length;
    }

    result[current.key] = rawText.slice(current.start, endPos).trim();
  }

  // Validate all sections are non-empty
  for (const key of Object.keys(result) as Array<keyof ParsedSections>) {
    if (!result[key] || result[key].trim().length === 0) {
      return null;
    }
  }

  return result;
}

// === SpecDraftGenerator ===

export class SpecDraftGenerator {
  private readonly config: SpecDraftGeneratorConfig;
  private readonly timeoutMs: number;

  private generating: boolean = false;
  private lastDraft: SpecDraft | null = null;
  private originalInput: string | null = null;

  constructor(config: SpecDraftGeneratorConfig) {
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  /**
   * Check if a generation is currently in progress.
   * Used for duplicate submission prevention (Req 1.6).
   */
  isGenerating(): boolean {
    return this.generating;
  }

  /**
   * Get the last successfully generated SpecDraft.
   */
  getLastDraft(): SpecDraft | null {
    return this.lastDraft;
  }

  /**
   * Get the original input text. Preserved for recovery on failure (Req 1.5).
   */
  getOriginalInput(): string | null {
    return this.originalInput;
  }

  /**
   * Generate a SpecDraft from the user's idea text.
   *
   * Streams the response token-by-token as StreamChunk objects.
   * After streaming completes, parses the accumulated output into
   * a structured SpecDraft with all 5 sections.
   *
   * DUPLICATE PREVENTION (Req 1.6): Throws DuplicateSubmissionError
   * if a generation is already in progress.
   *
   * INPUT PRESERVATION (Req 1.5): Stores the original input text
   * so it can be recovered on failure via getOriginalInput().
   *
   * STRUCTURAL COMPLETENESS (Req 1.3): After generation, validates
   * that all 5 sections are non-empty. Throws if validation fails.
   */
  async *generate(ideaText: string): AsyncGenerator<StreamChunk> {
    // Duplicate submission prevention (Req 1.6)
    if (this.generating) {
      throw new DuplicateSubmissionError();
    }

    // Store original input for recovery (Req 1.5)
    this.originalInput = ideaText;
    this.generating = true;
    this.lastDraft = null;

    let accumulatedContent = '';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const messages = [
          { role: 'system' as const, content: SPEC_DRAFT_SYSTEM_PROMPT },
          { role: 'user' as const, content: ideaText },
        ];

        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            messages,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new SpecDraftGenerationError(
            `API error: ${response.status} ${response.statusText}`,
            response.status >= 500,
          );
        }

        if (!response.body) {
          throw new SpecDraftGenerationError('Response body is null', true);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            yield {
              content: '',
              done: true,
              source: 'spec_generator' as const,
              timestamp: Date.now(),
            };
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              yield {
                content: '',
                done: true,
                source: 'spec_generator' as const,
                timestamp: Date.now(),
              };
              // Parse and validate the final draft
              this.lastDraft = this.parseAndValidate(accumulatedContent);
              return;
            }

            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                accumulatedContent += content;
                yield {
                  content,
                  done: false,
                  source: 'spec_generator' as const,
                  timestamp: Date.now(),
                };
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }

        // If we exited the loop without [DONE], still parse
        this.lastDraft = this.parseAndValidate(accumulatedContent);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: unknown) {
      // Preserve original input on failure (Req 1.5) — already stored above
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        throw new SpecDraftGenerationError(
          'Spec draft generation timed out',
          true,
        );
      }
      if (error instanceof DuplicateSubmissionError) {
        throw error;
      }
      if (error instanceof SpecDraftGenerationError) {
        throw error;
      }
      throw new SpecDraftGenerationError(
        error instanceof Error ? error.message : 'Unknown generation error',
        true,
      );
    } finally {
      this.generating = false;
    }
  }

  /**
   * Parse accumulated streaming content into a validated SpecDraft.
   * Throws if the output doesn't contain all 5 non-empty sections.
   */
  private parseAndValidate(content: string): SpecDraft {
    const sections = parseSections(content);

    if (!sections) {
      throw new SpecDraftGenerationError(
        'Generated output does not contain all 5 required non-empty sections (overview, proposedArchitecture, dataModel, apiSurface, assumptions)',
        true,
      );
    }

    return {
      overview: sections.overview,
      proposedArchitecture: sections.proposedArchitecture,
      dataModel: sections.dataModel,
      apiSurface: sections.apiSurface,
      assumptions: sections.assumptions,
      lastModified: Date.now(),
      version: 1,
    };
  }
}
