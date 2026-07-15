import type { Mitigation } from '../types/domain.ts';

// === Types for raw parsed mitigation data ===

interface RawMitigation {
  riskId?: unknown;
  riskTitle?: unknown;
  responseType?: unknown;
  description?: unknown;
  technologies?: unknown;
  tradeOffs?: unknown;
}

// === Valid response types ===

const VALID_RESPONSE_TYPES: ReadonlySet<string> = new Set([
  'fix',
  'trade_off',
  'accepted_risk',
]);

// === ID generation ===

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `mit-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Validates that a technologies array contains at least one specific named
 * technology or pattern (Req 3.3). Filters out empty strings and non-string values.
 */
function validateTechnologies(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;

  const filtered = raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());

  // Must contain at least one specific named technology/pattern
  if (filtered.length === 0) return null;

  return filtered;
}

/**
 * Validates and normalizes a single raw mitigation object into a Mitigation.
 * Returns null if the object is malformed or missing required fields.
 *
 * Requirements enforced:
 * - Req 3.2: Must have valid responseType (fix | trade_off | accepted_risk)
 * - Req 3.2: Must reference a Risk by riskId and riskTitle
 * - Req 3.3: technologies array must contain at least one specific named technology/pattern
 * - Req 10.4: Output must be a Mitigation, never a Risk
 */
function validateMitigation(raw: RawMitigation, mcpEvidence?: string): Mitigation | null {
  // Validate riskId - must be a non-empty string
  if (typeof raw.riskId !== 'string' || raw.riskId.trim().length === 0) {
    return null;
  }

  // Validate riskTitle - must be a non-empty string
  if (typeof raw.riskTitle !== 'string' || raw.riskTitle.trim().length === 0) {
    return null;
  }

  // Validate responseType - must be one of the valid enum values
  if (typeof raw.responseType !== 'string' || !VALID_RESPONSE_TYPES.has(raw.responseType)) {
    return null;
  }

  // Validate description - must be a non-empty string
  if (typeof raw.description !== 'string' || raw.description.trim().length === 0) {
    return null;
  }

  // Validate technologies - must have at least one specific named technology/pattern
  const technologies = validateTechnologies(raw.technologies);
  if (technologies === null) {
    return null;
  }

  // Validate tradeOffs - optional but must be an array of strings if present
  let tradeOffs: string[] = [];
  if (raw.tradeOffs !== undefined) {
    if (Array.isArray(raw.tradeOffs)) {
      tradeOffs = raw.tradeOffs
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim());
    }
    // Non-array tradeOffs is not a rejection reason — just default to empty
  }

  const mitigation: Mitigation = {
    id: generateId(),
    riskId: raw.riskId.trim(),
    riskTitle: raw.riskTitle.trim(),
    responseType: raw.responseType as Mitigation['responseType'],
    description: raw.description.trim(),
    technologies,
    tradeOffs,
    createdAt: Date.now(),
  };

  // Integrate MCP context citations in mcpEvidence field (Req 3.5)
  if (mcpEvidence !== undefined && mcpEvidence.trim().length > 0) {
    mitigation.mcpEvidence = mcpEvidence.trim();
  }

  return mitigation;
}

/**
 * Checks if an object looks like a Risk rather than a Mitigation (Req 10.4).
 * The parser MUST only produce Mitigation objects, never Risk objects.
 */
function looksLikeRisk(obj: Record<string, unknown>): boolean {
  return (
    'category' in obj &&
    'severity' in obj &&
    'affectedComponents' in obj &&
    !('responseType' in obj)
  );
}

/**
 * Attempts to extract a JSON array from raw text.
 * Handles cases where the JSON might be wrapped in markdown code blocks
 * or have surrounding text.
 */
function extractJsonArray(rawText: string): unknown[] | null {
  const trimmed = rawText.trim();

  // Try to find JSON array directly
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to other strategies
    }
  }

  // Try stripping markdown code block fences
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through
    }
  }

  // Try parsing the whole text as JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    // If it's a single object, wrap it
    if (typeof parsed === 'object' && parsed !== null) return [parsed];
  } catch {
    // Not valid JSON
  }

  return null;
}

/**
 * Parse raw streaming text (accumulated from StreamChunks) into an array of Mitigation objects.
 *
 * Behaviors:
 * 1. Parses JSON-like structured output from the AI (expects JSON array of mitigations)
 * 2. Validates each parsed mitigation has all required fields with valid enum values
 * 3. Skips/rejects malformed entries rather than throwing
 * 4. Only produces Mitigation objects, never Risk objects (Req 10.4)
 * 5. When mcpEvidence is available, populates the mcpEvidence field (Req 3.5)
 * 6. Generates unique IDs for each Mitigation
 *
 * @param rawText - Accumulated text from streaming output
 * @param mcpEvidence - Optional MCP context citation to attach to all mitigations
 * @returns Array of valid Mitigation objects (empty if parsing fails entirely)
 */
export function parseArchitectOutput(rawText: string, mcpEvidence?: string): Mitigation[] {
  if (!rawText || rawText.trim().length === 0) {
    return [];
  }

  const items = extractJsonArray(rawText);
  if (items === null) {
    return [];
  }

  const mitigations: Mitigation[] = [];

  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;

    const obj = item as Record<string, unknown>;

    // Reject items that look like Risk objects (Req 10.4)
    if (looksLikeRisk(obj)) continue;

    const mitigation = validateMitigation(obj as RawMitigation, mcpEvidence);
    if (mitigation !== null) {
      mitigations.push(mitigation);
    }
  }

  return mitigations;
}

/**
 * Streaming parser that accumulates chunks and can parse incrementally.
 * Designed to work with the AsyncGenerator<StreamChunk> pattern from the orchestrator.
 */
export class ArchitectStreamParser {
  private buffer: string = '';
  private mcpEvidence: string | undefined;
  private parsed: Mitigation[] = [];
  private complete: boolean = false;

  constructor(mcpEvidence?: string) {
    this.mcpEvidence = mcpEvidence;
  }

  /**
   * Add a chunk of streaming text to the buffer.
   */
  addChunk(content: string): void {
    if (this.complete) return;
    this.buffer += content;
  }

  /**
   * Mark the stream as complete and perform final parsing.
   */
  finalize(): Mitigation[] {
    this.complete = true;
    this.parsed = parseArchitectOutput(this.buffer, this.mcpEvidence);
    return this.parsed;
  }

  /**
   * Attempt to parse the current buffer state without finalizing.
   * Useful for providing incremental results during streaming.
   * Returns whatever valid mitigations can be extracted so far.
   */
  tryParse(): Mitigation[] {
    return parseArchitectOutput(this.buffer, this.mcpEvidence);
  }

  /**
   * Get the accumulated raw text buffer.
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Get the final parsed mitigations (only available after finalize()).
   */
  getResult(): Mitigation[] {
    return this.parsed;
  }

  /**
   * Check if the stream has been finalized.
   */
  isComplete(): boolean {
    return this.complete;
  }

  /**
   * Reset the parser state for reuse.
   */
  reset(mcpEvidence?: string): void {
    this.buffer = '';
    this.mcpEvidence = mcpEvidence;
    this.parsed = [];
    this.complete = false;
  }
}
