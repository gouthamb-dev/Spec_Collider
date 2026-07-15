import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateIdeaInput, validateRejectionReason, validateEditText } from '../../src/core/validation.ts';
import { arbInputText } from '../generators.ts';

describe('Feature: spec-collider, Property 1: Input length validation', () => {
  /**
   * Validates: Requirements 1.1
   *
   * For any string input, the submission validator SHALL accept the input
   * if and only if its character length is between 10 and 5000 inclusive;
   * inputs outside this range SHALL be rejected with a validation error
   * containing the allowed length bounds.
   */

  it('accepts strings with length between 10 and 5000 inclusive', () => {
    fc.assert(
      fc.property(arbInputText(10, 5000), (text) => {
        const result = validateIdeaInput(text);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('rejects strings shorter than 10 characters', () => {
    fc.assert(
      fc.property(arbInputText(0, 9), (text) => {
        const result = validateIdeaInput(text);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('10');
        expect(result.error).toContain('5000');
      }),
      { numRuns: 100 }
    );
  });

  it('rejects strings longer than 5000 characters', () => {
    fc.assert(
      fc.property(arbInputText(5001, 6000), (text) => {
        const result = validateIdeaInput(text);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('10');
        expect(result.error).toContain('5000');
      }),
      { numRuns: 100 }
    );
  });

  it('rejection reason validation: accepts strings 1–1000 chars', () => {
    fc.assert(
      fc.property(arbInputText(1, 1000), (reason) => {
        const result = validateRejectionReason(reason);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('rejection reason validation: rejects empty strings', () => {
    const result = validateRejectionReason('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('1');
    expect(result.error).toContain('1000');
  });

  it('rejection reason validation: rejects strings over 1000 chars', () => {
    fc.assert(
      fc.property(arbInputText(1001, 2000), (reason) => {
        const result = validateRejectionReason(reason);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('1');
        expect(result.error).toContain('1000');
      }),
      { numRuns: 100 }
    );
  });

  it('edit text validation: accepts strings 1–5000 chars', () => {
    fc.assert(
      fc.property(arbInputText(1, 5000), (text) => {
        const result = validateEditText(text);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('edit text validation: rejects empty strings', () => {
    const result = validateEditText('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('1');
    expect(result.error).toContain('5000');
  });

  it('edit text validation: rejects strings over 5000 chars', () => {
    fc.assert(
      fc.property(arbInputText(5001, 6000), (text) => {
        const result = validateEditText(text);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('1');
        expect(result.error).toContain('5000');
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 9: Reject validation and state preservation', () => {
  /**
   * Validates: Requirements 4.3
   *
   * For any rejection reason string, if the length is between 1 and 1000 inclusive,
   * the rejection SHALL be recorded (validation passes) and the SpecDraft SHALL
   * remain unchanged; if the length is outside this range (0 or >1000), the rejection
   * SHALL be prevented with a validation error.
   */

  it('valid rejection reasons (1–1000 chars) pass validation', () => {
    fc.assert(
      fc.property(arbInputText(1, 1000), (reason) => {
        const result = validateRejectionReason(reason);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('invalid rejection reasons (empty or >1000 chars) fail validation', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          arbInputText(1001, 2000)
        ),
        (reason) => {
          const result = validateRejectionReason(reason);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: spec-collider, Property 10: Edit validation and application', () => {
  /**
   * Validates: Requirements 4.4
   *
   * For any edit text string, if the length is between 1 and 5000 inclusive and
   * the user confirms, the edited text SHALL be applied to the SpecDraft; if the
   * length exceeds 5000, the edit SHALL be rejected with a validation error.
   */

  it('valid edit text (1–5000 chars) passes validation', () => {
    fc.assert(
      fc.property(arbInputText(1, 5000), (text) => {
        const result = validateEditText(text);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('invalid edit text (empty or >5000 chars) fails validation', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          arbInputText(5001, 6000)
        ),
        (text) => {
          const result = validateEditText(text);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
