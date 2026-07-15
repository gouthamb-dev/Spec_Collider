import { describe, it, expect, beforeEach } from 'vitest';
import { parseRedTeamOutput, RedTeamStreamParser } from '../../src/agents/red-team-parser.ts';

describe('parseRedTeamOutput', () => {
  const validRisk = {
    title: 'SQL Injection in user endpoint',
    category: 'security',
    severity: 'critical',
    description: 'The user input is not sanitized before being passed to the database query.',
    affected_components: ['UserService', 'Database'],
    evidence: 'Line 42 in user-service.ts uses string interpolation for SQL.',
  };

  describe('basic parsing', () => {
    it('should parse a valid JSON array of risks', () => {
      const rawText = JSON.stringify([validRisk]);
      const result = parseRedTeamOutput(rawText, false);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('SQL Injection in user endpoint');
      expect(result[0].category).toBe('security');
      expect(result[0].severity).toBe('critical');
      expect(result[0].description).toBe('The user input is not sanitized before being passed to the database query.');
      expect(result[0].affectedComponents).toEqual(['UserService', 'Database']);
      expect(result[0].evidence).toContain('Line 42');
      expect(result[0].isChaosRound).toBe(false);
      expect(result[0].id).toMatch(/^risk-/);
      expect(result[0].createdAt).toBeGreaterThan(0);
    });

    it('should parse risks in markdown code blocks', () => {
      const rawText = '```json\n' + JSON.stringify([validRisk]) + '\n```';
      const result = parseRedTeamOutput(rawText, false);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('SQL Injection in user endpoint');
    });

    it('should parse risks from code blocks without language specifier', () => {
      const rawText = '```\n' + JSON.stringify([validRisk]) + '\n```';
      const result = parseRedTeamOutput(rawText, false);

      expect(result).toHaveLength(1);
    });

    it('should parse multiple risks in a JSON array', () => {
      const risks = [
        validRisk,
        {
          title: 'Missing rate limiting',
          category: 'reliability',
          severity: 'high',
          description: 'No rate limiting on the API endpoints.',
          affected_components: ['APIGateway'],
          evidence: 'No rate limit configuration found in gateway config.',
        },
      ];
      const rawText = JSON.stringify(risks);
      const result = parseRedTeamOutput(rawText, false);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('SQL Injection in user endpoint');
      expect(result[1].title).toBe('Missing rate limiting');
    });

    it('should handle affectedComponents (camelCase) in addition to affected_components', () => {
      const risk = {
        title: 'Scalability concern',
        category: 'scalability',
        severity: 'medium',
        description: 'Single database without sharding.',
        affectedComponents: ['Database', 'QueryEngine'],
        evidence: 'Architecture diagram shows single DB instance.',
      };
      const result = parseRedTeamOutput(JSON.stringify([risk]), false);

      expect(result).toHaveLength(1);
      expect(result[0].affectedComponents).toEqual(['Database', 'QueryEngine']);
    });
  });

  describe('isChaosRound flag (Req 2.5)', () => {
    it('should set isChaosRound=true when chaos round is specified', () => {
      const rawText = JSON.stringify([validRisk]);
      const result = parseRedTeamOutput(rawText, true);

      expect(result).toHaveLength(1);
      expect(result[0].isChaosRound).toBe(true);
    });

    it('should set isChaosRound=false for standard invocations', () => {
      const rawText = JSON.stringify([validRisk]);
      const result = parseRedTeamOutput(rawText, false);

      expect(result).toHaveLength(1);
      expect(result[0].isChaosRound).toBe(false);
    });
  });

  describe('MCP evidence integration', () => {
    it('should append MCP evidence to existing evidence', () => {
      const rawText = JSON.stringify([validRisk]);
      const mcpEvidence = 'AWS RDS instance has no encryption at rest enabled';
      const result = parseRedTeamOutput(rawText, false, mcpEvidence);

      expect(result).toHaveLength(1);
      expect(result[0].evidence).toContain('Line 42');
      expect(result[0].evidence).toContain('[MCP Context]');
      expect(result[0].evidence).toContain('AWS RDS instance');
    });

    it('should use MCP evidence as sole evidence when field is empty', () => {
      const risk = {
        title: 'Unencrypted storage',
        category: 'security',
        severity: 'high',
        description: 'Data stored without encryption.',
        affected_components: ['StorageService'],
        evidence: '',
      };
      const mcpEvidence = 'S3 bucket lacks server-side encryption';
      const result = parseRedTeamOutput(JSON.stringify([risk]), false, mcpEvidence);

      expect(result).toHaveLength(1);
      expect(result[0].evidence).toBe('[MCP Context]: S3 bucket lacks server-side encryption');
    });

    it('should reject risk without evidence and without MCP evidence', () => {
      const risk = {
        title: 'Missing evidence risk',
        category: 'security',
        severity: 'high',
        description: 'Something bad.',
        affected_components: ['Service'],
        evidence: '',
      };
      const result = parseRedTeamOutput(JSON.stringify([risk]), false);

      expect(result).toHaveLength(0);
    });
  });

  describe('validation and rejection of malformed entries', () => {
    it('should reject entries with invalid category', () => {
      const risk = { ...validRisk, category: 'invalid_category' };
      const result = parseRedTeamOutput(JSON.stringify([risk]), false);

      expect(result).toHaveLength(0);
    });

    it('should reject entries with invalid severity', () => {
      const risk = { ...validRisk, severity: 'extreme' };
      const result = parseRedTeamOutput(JSON.stringify([risk]), false);

      expect(result).toHaveLength(0);
    });

    it('should reject entries missing title', () => {
      const risk = { ...validRisk, title: '' };
      const result = parseRedTeamOutput(JSON.stringify([risk]), false);

      expect(result).toHaveLength(0);
    });

    it('should reject entries missing description', () => {
      const risk = { ...validRisk, description: '' };
      const result = parseRedTeamOutput(JSON.stringify([risk]), false);

      expect(result).toHaveLength(0);
    });

    it('should reject entries with empty affectedComponents', () => {
      const risk = { ...validRisk, affected_components: [] };
      const result = parseRedTeamOutput(JSON.stringify([risk]), false);

      expect(result).toHaveLength(0);
    });

    it('should skip malformed entries while keeping valid ones', () => {
      const risks = [
        validRisk,
        { title: 'Bad risk', category: 'invalid' },
        {
          title: 'Valid second risk',
          category: 'edge_case',
          severity: 'low',
          description: 'Edge case found.',
          affected_components: ['Frontend'],
          evidence: 'User can trigger overflow.',
        },
      ];
      const result = parseRedTeamOutput(JSON.stringify(risks), false);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('SQL Injection in user endpoint');
      expect(result[1].title).toBe('Valid second risk');
    });

    it('should return empty array for empty input', () => {
      expect(parseRedTeamOutput('', false)).toEqual([]);
      expect(parseRedTeamOutput('   ', false)).toEqual([]);
    });

    it('should return empty array for non-JSON text', () => {
      expect(parseRedTeamOutput('This is just some text', false)).toEqual([]);
    });
  });

  describe('Mitigation exclusivity (Req 10.3)', () => {
    it('should reject items that look like Mitigations', () => {
      const mitigation = {
        riskId: 'risk-1',
        riskTitle: 'Some risk',
        responseType: 'fix',
        description: 'Fix the problem',
        technologies: ['Redis'],
      };
      const result = parseRedTeamOutput(JSON.stringify([mitigation]), false);

      expect(result).toHaveLength(0);
    });

    it('should reject items with responseType field', () => {
      const hybrid = {
        title: 'Tricky item',
        category: 'security',
        severity: 'high',
        description: 'Has mixed fields',
        affected_components: ['Service'],
        evidence: 'Some evidence',
        responseType: 'fix',
      };
      const result = parseRedTeamOutput(JSON.stringify([hybrid]), false);

      expect(result).toHaveLength(0);
    });
  });

  describe('unique ID generation', () => {
    it('should generate unique IDs for each parsed risk', () => {
      const risks = [validRisk, { ...validRisk, title: 'Second risk' }];
      const result = parseRedTeamOutput(JSON.stringify(risks), false);

      expect(result).toHaveLength(2);
      expect(result[0].id).not.toBe(result[1].id);
    });
  });

  describe('JSON extraction from mixed content', () => {
    it('should parse JSON embedded in surrounding text', () => {
      const rawText = `Here are the risks I found:\n${JSON.stringify([validRisk])}\n\nThese are critical issues.`;
      const result = parseRedTeamOutput(rawText, false);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('SQL Injection in user endpoint');
    });
  });
});

describe('RedTeamStreamParser', () => {
  let parser: RedTeamStreamParser;

  beforeEach(() => {
    parser = new RedTeamStreamParser(false);
  });

  describe('chunk accumulation', () => {
    it('should accumulate chunks into a buffer', () => {
      parser.addChunk('[{');
      parser.addChunk('"title":"Test"');
      parser.addChunk('}]');

      expect(parser.getBuffer()).toBe('[{"title":"Test"}]');
    });

    it('should throw when adding chunks after finalize', () => {
      parser.finalize();
      expect(() => parser.addChunk('test')).toThrow('Parser has been finalized');
    });
  });

  describe('tryParse', () => {
    it('should return empty array when buffer is incomplete', () => {
      parser.addChunk('[{"title":"partial...');
      expect(parser.tryParse()).toEqual([]);
    });

    it('should parse when buffer contains complete JSON', () => {
      const risk = JSON.stringify([{
        title: 'Streaming risk',
        category: 'reliability',
        severity: 'medium',
        description: 'Found during streaming.',
        affected_components: ['StreamService'],
        evidence: 'Observed during load test.',
      }]);

      // Simulate streaming by adding character by character for the first few chars
      for (const char of risk) {
        parser.addChunk(char);
      }

      const result = parser.tryParse();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Streaming risk');
    });
  });

  describe('finalize', () => {
    it('should return final risks and mark parser as finalized', () => {
      const risk = JSON.stringify([{
        title: 'Final risk',
        category: 'scalability',
        severity: 'high',
        description: 'Scalability issue.',
        affected_components: ['Database'],
        evidence: 'Single instance without replicas.',
      }]);

      parser.addChunk(risk);
      const result = parser.finalize();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Final risk');
      expect(parser.isFinalized()).toBe(true);
    });
  });

  describe('chaos round mode', () => {
    it('should set isChaosRound=true when constructed with chaos flag', () => {
      const chaosParser = new RedTeamStreamParser(true);
      chaosParser.addChunk(JSON.stringify([{
        title: 'Chaos risk',
        category: 'reliability',
        severity: 'critical',
        description: 'Cascading failure.',
        affected_components: ['AllServices'],
        evidence: 'No circuit breaker.',
      }]));

      const result = chaosParser.finalize();
      expect(result).toHaveLength(1);
      expect(result[0].isChaosRound).toBe(true);
    });
  });

  describe('MCP evidence via constructor', () => {
    it('should include MCP evidence when provided at construction', () => {
      const mcpParser = new RedTeamStreamParser(false, 'EC2 instance has public IP');
      mcpParser.addChunk(JSON.stringify([{
        title: 'Public exposure',
        category: 'security',
        severity: 'critical',
        description: 'Service exposed to internet.',
        affected_components: ['EC2Instance'],
        evidence: 'Port 22 open.',
      }]));

      const result = mcpParser.finalize();
      expect(result).toHaveLength(1);
      expect(result[0].evidence).toContain('Port 22 open');
      expect(result[0].evidence).toContain('[MCP Context]');
      expect(result[0].evidence).toContain('EC2 instance has public IP');
    });
  });

  describe('reset', () => {
    it('should allow reuse after reset', () => {
      parser.addChunk('some content');
      parser.finalize();

      parser.reset();
      expect(parser.isFinalized()).toBe(false);
      expect(parser.getBuffer()).toBe('');

      parser.addChunk(JSON.stringify([{
        title: 'After reset',
        category: 'edge_case',
        severity: 'low',
        description: 'Found after reset.',
        affected_components: ['Parser'],
        evidence: 'Test confirms reset works.',
      }]));

      const result = parser.finalize();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('After reset');
    });
  });
});
