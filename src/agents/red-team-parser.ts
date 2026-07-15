import type { Risk } from '../types/domain.ts';

// === Valid enum values for validation ===

const VALID_CATEGORIES: Risk['category'][] = [
  'scalability',
  'security',
  'reliability',
  'edge_case',
  'missing_assumption',
];

const VALID_SEVERITIES: Risk['severity'][] = [
  'critical',
  'high',
  'medium',
  'low',
];

// === ID Generation ===

let idCounter = 0;

/**
 * Generate a unique ID for a Risk.
 * Uses a combination of timestamp and counter for uniqueness.
 */
function generateRiskId(): string {
  idCounter += 1;
  return `risk-${Date.now()}-${idCounter}`;
}

// === Validation Helpers ===

function isValidCategory(value: unknown): value is Risk['category'] {
  return typeof value === 'string' && VALID_CATEGORIES.includes(value as Risk['category']);
}

function isValidSeverity(value: unknown): value is Risk['severity'] {
  return typeof value === 'string' && VALID_SEVERITIES.includes(value as Risk['severity']);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim().length > 0);
}

/**
 * Validates a raw parsed object against the Risk interface requirements.
 * Returns a valid Risk if all required fields are present and valid, or null otherwise.
 *
 * Key constraint (Req 10.3): This parser ONLY produces Risk objects, never Mitigation objects.
 * If an item looks like a Mitigation (has riskId, responseType, technologies without
 * category/severity), it is rejected.
 */
function validateRiskCandidate(
  raw: Record<string, unknown>,
  isChaosRound: boolean,
  mcpEvidence?: string,
): Risk | null {
  // Reject items that look like Mitigations (Req 10.3)
  if ('responseType' in raw || ('riskId' in raw && !('category' in raw))) {
    return null;
  }

  const title = raw.title;
  const category = raw.category;
  const severity = raw.severity;
  const description = raw.description;
  const affectedComponents = raw.affected_components ?? raw.affectedComponents;
  const evidence = raw.evidence;

  // Validate all required fields
  if (!isNonEmptyString(title)) return null;
  if (!isValidCategory(category)) return null;
  if (!isValidSeverity(severity)) return null;
  if (!isNonEmptyString(description)) return null;
  if (!isStringArray(affectedComponents)) return null;

  // Evidence: use MCP context if available and field is empty/missing
  let resolvedEvidence: string;
  if (isNonEmptyString(evidence)) {
    resolvedEvidence = mcpEvidence
      ? `${evidence}\n\n[MCP Context]: ${mcpEvidence}`
      : evidence;
  } else if (mcpEvidence) {
    resolvedEvidence = `[MCP Context]: ${mcpEvidence}`;
  } else {
    return null; // Evidence is required
  }

  return {
    id: generateRiskId(),
    title: title.trim(),
    category,
    severity,
    description: (description as string).trim(),
    affectedComponents: (affectedComponents as string[]).map(c => c.trim()),
    evidence: resolvedEvidence.trim(),
    isChaosRound,
    createdAt: Date.now(),
  };
}

// === Main Parser Function ===

/**
 * Parse raw streaming text (accumulated from StreamChunks) into an array of Risk objects.
 *
 * Expects the AI to output a JSON array of risk objects. Handles:
 * - Direct JSON array: [{ ... }, { ... }]
 * - JSON wrapped in markdown code blocks: ```json [...] ```
 * - Multiple JSON objects separated by newlines
 *
 * Malformed entries are silently skipped rather than throwing errors.
 *
 * @param rawText - The accumulated text from streaming output
 * @param isChaosRound - Whether this parse is for a chaos round invocation (Req 2.5)
 * @param mcpEvidence - Optional MCP context data to include as evidence
 * @returns Array of validated Risk objects
 */
export function parseRedTeamOutput(
  rawText: string,
  isChaosRound: boolean,
  mcpEvidence?: string,
): Risk[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  const risks: Risk[] = [];
  const candidates = extractJsonCandidates(trimmed);

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      // It's an array of risk objects
      for (const item of candidate) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const risk = validateRiskCandidate(item as Record<string, unknown>, isChaosRound, mcpEvidence);
          if (risk) risks.push(risk);
        }
      }
    } else if (candidate && typeof candidate === 'object') {
      // It's a single risk object
      const risk = validateRiskCandidate(candidate as Record<string, unknown>, isChaosRound, mcpEvidence);
      if (risk) risks.push(risk);
    }
  }

  return risks;
}

/**
 * Extract JSON candidates from raw text. Handles:
 * 1. Markdown code blocks with JSON content
 * 2. Raw JSON arrays
 * 3. Raw JSON objects (possibly multiple separated by whitespace)
 */
function extractJsonCandidates(text: string): unknown[] {
  const candidates: unknown[] = [];

  // Try to extract from markdown code blocks first
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  let match: RegExpExecArray | null;
  let foundCodeBlock = false;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    foundCodeBlock = true;
    const content = match[1].trim();
    const parsed = tryParseJson(content);
    if (parsed !== undefined) {
      candidates.push(parsed);
    }
  }

  if (foundCodeBlock && candidates.length > 0) {
    return candidates;
  }

  // Try parsing the whole text as JSON
  const directParsed = tryParseJson(text);
  if (directParsed !== undefined) {
    candidates.push(directParsed);
    return candidates;
  }

  // Try to find JSON array or object boundaries
  const jsonStart = text.indexOf('[');
  const objStart = text.indexOf('{');

  if (jsonStart !== -1 && (objStart === -1 || jsonStart < objStart)) {
    // Try to find matching bracket for array
    const arrayContent = extractBracketContent(text, jsonStart, '[', ']');
    if (arrayContent) {
      const parsed = tryParseJson(arrayContent);
      if (parsed !== undefined) {
        candidates.push(parsed);
        return candidates;
      }
    }
  }

  if (objStart !== -1) {
    // Try parsing individual objects separated by newlines or commas
    const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    let objMatch: RegExpExecArray | null;
    while ((objMatch = objectRegex.exec(text)) !== null) {
      const parsed = tryParseJson(objMatch[0]);
      if (parsed !== undefined) {
        candidates.push(parsed);
      }
    }
  }

  return candidates;
}

/**
 * Extract content between matching brackets starting at a given position.
 */
function extractBracketContent(text: string, start: number, open: string, close: string): string | null {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === open) depth++;
    if (char === close) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Attempt to parse a string as JSON, returning undefined on failure.
 */
function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// === Streaming Parser Class ===

/**
 * RedTeamStreamParser accumulates StreamChunks and can parse incrementally.
 *
 * Usage:
 *   const parser = new RedTeamStreamParser(isChaosRound, mcpEvidence);
 *   for await (const chunk of stream) {
 *     parser.addChunk(chunk.content);
 *   }
 *   const risks = parser.finalize();
 */
export class RedTeamStreamParser {
  private buffer: string = '';
  private readonly isChaosRound: boolean;
  private readonly mcpEvidence?: string;
  private finalized: boolean = false;

  constructor(isChaosRound: boolean, mcpEvidence?: string) {
    this.isChaosRound = isChaosRound;
    this.mcpEvidence = mcpEvidence;
  }

  /**
   * Add a text chunk to the internal buffer.
   * Call this for each StreamChunk.content received.
   */
  addChunk(content: string): void {
    if (this.finalized) {
      throw new Error('Parser has been finalized. Create a new instance for additional parsing.');
    }
    this.buffer += content;
  }

  /**
   * Get the currently accumulated raw text.
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Attempt to parse the current buffer into Risk objects.
   * Can be called multiple times during streaming to get intermediate results.
   * Returns an empty array if the buffer doesn't contain parseable content yet.
   */
  tryParse(): Risk[] {
    return parseRedTeamOutput(this.buffer, this.isChaosRound, this.mcpEvidence);
  }

  /**
   * Finalize the parser and return the final set of parsed Risk objects.
   * After calling finalize(), addChunk() will throw.
   */
  finalize(): Risk[] {
    this.finalized = true;
    return parseRedTeamOutput(this.buffer, this.isChaosRound, this.mcpEvidence);
  }

  /**
   * Whether the parser has been finalized.
   */
  isFinalized(): boolean {
    return this.finalized;
  }

  /**
   * Reset the parser state to accept new chunks.
   */
  reset(): void {
    this.buffer = '';
    this.finalized = false;
  }
}
