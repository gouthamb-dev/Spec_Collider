import { describe, it, expect } from 'vitest';
import { parseArchitectOutput, ArchitectStreamParser } from '../../src/agents/architect-parser.ts';

// === Helper: valid mitigation JSON ===

function validMitigationJson(overrides: Record<string, unknown> = {}) {
  return {
    riskId: 'risk-001',
    riskTitle: 'SQL Injection Vulnerability',
    responseType: 'fix',
    description: 'Use parameterized queries to prevent SQL injection attacks.',
    technologies: ['PostgreSQL prepared statements', 'Drizzle ORM'],
    tradeOffs: ['Slightly more verbose query code'],
    ...overrides,
  };
}

describe('parseArchitectOutput', () => {
  describe('valid input parsing', () => {
    it('parses a JSON array of valid mitigations', () => {
      const input = JSON.stringify([validMitigationJson()]);
      const result = parseArchitectOutput(input);

      expect(result).toHaveLength(1);
      expect(result[0].riskId).toBe('risk-001');
      expect(result[0].riskTitle).toBe('SQL Injection Vulnerability');
      expect(result[0].responseType).toBe('fix');
      expect(result[0].description).toBe('Use parameterized queries to prevent SQL injection attacks.');
      expect(result[0].technologies).toEqual(['PostgreSQL prepared statements', 'Drizzle ORM']);
      expect(result[0].tradeOffs).toEqual(['Slightly more verbose query code']);
    });

    it('parses multiple mitigations from a single array', () => {
      const input = JSON.stringify([
        validMitigationJson({ riskId: 'risk-001', responseType: 'fix' }),
        validMitigationJson({ riskId: 'risk-002', responseType: 'trade_off', riskTitle: 'Memory Pressure' }),
        validMitigationJson({ riskId: 'risk-003', responseType: 'accepted_risk', riskTitle: 'Rate Limiting Gap' }),
      ]);
      const result = parseArchitectOutput(input);

      expect(result).toHaveLength(3);
      expect(result[0].responseType).toBe('fix');
      expect(result[1].responseType).toBe('trade_off');
      expect(result[2].responseType).toBe('accepted_risk');
    });

    it('parses a single mitigation object (not wrapped in array)', () => {
      const input = JSON.stringify(validMitigationJson());
      const result = parseArchitectOutput(input);

      expect(result).toHaveLength(1);
      expect(result[0].riskId).toBe('risk-001');
    });

    it('handles JSON inside markdown code blocks', () => {
      const input = '```json\n' + JSON.stringify([validMitigationJson()]) + '\n```';
      const result = parseArchitectOutput(input);

      expect(result).toHaveLength(1);
      expect(result[0].riskId).toBe('risk-001');
    });

    it('handles JSON surrounded by extra text', () => {
      const input = 'Here are my mitigations:\n' + JSON.stringify([validMitigationJson()]) + '\nDone.';
      const result = parseArchitectOutput(input);

      expect(result).toHaveLength(1);
    });
  });

  describe('ID generation', () => {
    it('generates unique IDs for each mitigation', () => {
      const input = JSON.stringify([
        validMitigationJson({ riskId: 'risk-001' }),
        validMitigationJson({ riskId: 'risk-002' }),
      ]);
      const result = parseArchitectOutput(input);

      expect(result[0].id).toBeDefined();
      expect(result[1].id).toBeDefined();
      expect(result[0].id).not.toBe(result[1].id);
    });

    it('generates IDs with mit- prefix', () => {
      const input = JSON.stringify([validMitigationJson()]);
      const result = parseArchitectOutput(input);

      expect(result[0].id).toMatch(/^mit-/);
    });
  });

  describe('responseType validation (Req 3.2)', () => {
    it('accepts fix responseType', () => {
      const input = JSON.stringify([validMitigationJson({ responseType: 'fix' })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(1);
      expect(result[0].responseType).toBe('fix');
    });

    it('accepts trade_off responseType', () => {
      const input = JSON.stringify([validMitigationJson({ responseType: 'trade_off' })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(1);
      expect(result[0].responseType).toBe('trade_off');
    });

    it('accepts accepted_risk responseType', () => {
      const input = JSON.stringify([validMitigationJson({ responseType: 'accepted_risk' })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(1);
      expect(result[0].responseType).toBe('accepted_risk');
    });

    it('rejects invalid responseType', () => {
      const input = JSON.stringify([validMitigationJson({ responseType: 'ignore' })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(0);
    });

    it('rejects missing responseType', () => {
      const mit = validMitigationJson();
      delete (mit as Record<string, unknown>).responseType;
      const input = JSON.stringify([mit]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(0);
    });
  });

  describe('Risk reference validation (Req 3.2)', () => {
    it('rejects mitigation with missing riskId', () => {
      const mit = validMitigationJson();
      delete (mit as Record<string, unknown>).riskId;
      const input = JSON.stringify([mit]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(0);
    });

    it('rejects mitigation with empty riskId', () => {
      const input = JSON.stringify([validMitigationJson({ riskId: '' })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(0);
    });

    it('rejects mitigation with missing riskTitle', () => {
      const mit = validMitigationJson();
      delete (mit as Record<string, unknown>).riskTitle;
      const input = JSON.stringify([mit]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(0);
    });

    it('rejects mitigation with empty riskTitle', () => {
      const input = JSON.stringify([validMitigationJson({ riskTitle: '' })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(0);
    });
  });

  describe('technologies validation (Req 3.3)', () => {
    it('requires at least one technology', () => {
      const input = JSON.stringify([validMitigationJson({ technologies: [] })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(0);
    });

    it('rejects technologies with only empty strings', () => {
      const input = JSON.stringify([validMitigationJson({ technologies: ['', '  '] })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(0);
    });

    it('filters out empty strings but keeps valid ones', () => {
      const input = JSON.stringify([validMitigationJson({ technologies: ['Redis', '', 'Kafka'] })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(1);
      expect(result[0].technologies).toEqual(['Redis', 'Kafka']);
    });

    it('rejects non-array technologies', () => {
      const input = JSON.stringify([validMitigationJson({ technologies: 'Redis' })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(0);
    });

    it('rejects missing technologies field', () => {
      const mit = validMitigationJson();
      delete (mit as Record<string, unknown>).technologies;
      const input = JSON.stringify([mit]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(0);
    });
  });

  describe('Risk exclusion (Req 10.4)', () => {
    it('rejects objects that look like Risk items', () => {
      const riskObj = {
        title: 'SQL Injection',
        category: 'security',
        severity: 'critical',
        description: 'The app is vulnerable',
        affectedComponents: ['api-gateway'],
        evidence: 'Found in code review',
      };
      const input = JSON.stringify([riskObj, validMitigationJson()]);
      const result = parseArchitectOutput(input);

      // Only the mitigation should pass, not the risk
      expect(result).toHaveLength(1);
      expect(result[0].riskId).toBe('risk-001');
    });
  });

  describe('MCP evidence integration (Req 3.5)', () => {
    it('populates mcpEvidence when provided', () => {
      const input = JSON.stringify([validMitigationJson()]);
      const evidence = 'Based on AWS CloudFormation stack analysis: us-east-1 deployment uses t3.micro instances';
      const result = parseArchitectOutput(input, evidence);

      expect(result).toHaveLength(1);
      expect(result[0].mcpEvidence).toBe(evidence);
    });

    it('omits mcpEvidence when not provided', () => {
      const input = JSON.stringify([validMitigationJson()]);
      const result = parseArchitectOutput(input);

      expect(result).toHaveLength(1);
      expect(result[0].mcpEvidence).toBeUndefined();
    });

    it('omits mcpEvidence when empty string is provided', () => {
      const input = JSON.stringify([validMitigationJson()]);
      const result = parseArchitectOutput(input, '  ');

      expect(result).toHaveLength(1);
      expect(result[0].mcpEvidence).toBeUndefined();
    });
  });

  describe('malformed input handling', () => {
    it('returns empty array for empty string', () => {
      expect(parseArchitectOutput('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(parseArchitectOutput('   ')).toEqual([]);
    });

    it('returns empty array for non-JSON text', () => {
      expect(parseArchitectOutput('This is just regular text with no JSON')).toEqual([]);
    });

    it('returns empty array for invalid JSON', () => {
      expect(parseArchitectOutput('[{invalid json')).toEqual([]);
    });

    it('skips malformed entries while keeping valid ones', () => {
      const input = JSON.stringify([
        { riskId: 'r1' }, // missing required fields
        validMitigationJson({ riskId: 'risk-valid' }),
        { notAMitigation: true },
      ]);
      const result = parseArchitectOutput(input);

      expect(result).toHaveLength(1);
      expect(result[0].riskId).toBe('risk-valid');
    });

    it('handles null items in array gracefully', () => {
      const input = '[null, ' + JSON.stringify(validMitigationJson()) + ']';
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(1);
    });
  });

  describe('tradeOffs field handling', () => {
    it('accepts empty tradeOffs array', () => {
      const input = JSON.stringify([validMitigationJson({ tradeOffs: [] })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(1);
      expect(result[0].tradeOffs).toEqual([]);
    });

    it('handles missing tradeOffs gracefully (defaults to empty array)', () => {
      const mit = validMitigationJson();
      delete (mit as Record<string, unknown>).tradeOffs;
      const input = JSON.stringify([mit]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(1);
      expect(result[0].tradeOffs).toEqual([]);
    });

    it('filters non-string items from tradeOffs', () => {
      const input = JSON.stringify([validMitigationJson({ tradeOffs: ['valid', 123, null, 'also valid'] })]);
      const result = parseArchitectOutput(input);
      expect(result).toHaveLength(1);
      expect(result[0].tradeOffs).toEqual(['valid', 'also valid']);
    });
  });
});

describe('ArchitectStreamParser', () => {
  it('accumulates chunks and parses on finalize', () => {
    const parser = new ArchitectStreamParser();
    const json = JSON.stringify([validMitigationJson()]);

    // Simulate streaming in chunks
    parser.addChunk(json.slice(0, 20));
    parser.addChunk(json.slice(20, 50));
    parser.addChunk(json.slice(50));

    const result = parser.finalize();
    expect(result).toHaveLength(1);
    expect(result[0].riskId).toBe('risk-001');
  });

  it('returns parsed results via getResult after finalize', () => {
    const parser = new ArchitectStreamParser();
    parser.addChunk(JSON.stringify([validMitigationJson()]));
    parser.finalize();

    expect(parser.getResult()).toHaveLength(1);
  });

  it('tryParse returns partial results mid-stream', () => {
    const parser = new ArchitectStreamParser();
    const json = JSON.stringify([validMitigationJson()]);
    parser.addChunk(json);

    const partial = parser.tryParse();
    expect(partial).toHaveLength(1);
    expect(parser.isComplete()).toBe(false);
  });

  it('ignores chunks after finalize', () => {
    const parser = new ArchitectStreamParser();
    parser.addChunk(JSON.stringify([validMitigationJson()]));
    parser.finalize();

    parser.addChunk(JSON.stringify([validMitigationJson({ riskId: 'extra' })]));
    expect(parser.getBuffer()).toBe(JSON.stringify([validMitigationJson()]));
  });

  it('integrates mcpEvidence via constructor', () => {
    const evidence = 'CloudFormation stack shows t3.micro instances';
    const parser = new ArchitectStreamParser(evidence);
    parser.addChunk(JSON.stringify([validMitigationJson()]));
    const result = parser.finalize();

    expect(result[0].mcpEvidence).toBe(evidence);
  });

  it('reset clears all state', () => {
    const parser = new ArchitectStreamParser('old evidence');
    parser.addChunk(JSON.stringify([validMitigationJson()]));
    parser.finalize();

    parser.reset('new evidence');
    expect(parser.getBuffer()).toBe('');
    expect(parser.getResult()).toEqual([]);
    expect(parser.isComplete()).toBe(false);

    parser.addChunk(JSON.stringify([validMitigationJson({ riskId: 'new-risk' })]));
    const result = parser.finalize();
    expect(result[0].riskId).toBe('new-risk');
    expect(result[0].mcpEvidence).toBe('new evidence');
  });

  it('isComplete returns correct state', () => {
    const parser = new ArchitectStreamParser();
    expect(parser.isComplete()).toBe(false);

    parser.addChunk('data');
    expect(parser.isComplete()).toBe(false);

    parser.finalize();
    expect(parser.isComplete()).toBe(true);
  });

  it('getBuffer returns accumulated content', () => {
    const parser = new ArchitectStreamParser();
    parser.addChunk('hello');
    parser.addChunk(' world');
    expect(parser.getBuffer()).toBe('hello world');
  });
});
