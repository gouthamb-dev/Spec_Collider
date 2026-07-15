import { describe, it, expect } from 'vitest';
import {
  validateIdeaInput,
  validateRejectionReason,
  validateEditText,
} from '../../src/core/validation.ts';

describe('validateIdeaInput', () => {
  it('accepts input at minimum length (10 chars)', () => {
    const result = validateIdeaInput('a'.repeat(10));
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts input at maximum length (5000 chars)', () => {
    const result = validateIdeaInput('b'.repeat(5000));
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects input shorter than 10 chars', () => {
    const result = validateIdeaInput('short');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Input must be between 10 and 5000 characters');
  });

  it('rejects empty input', () => {
    const result = validateIdeaInput('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Input must be between 10 and 5000 characters');
  });

  it('rejects input longer than 5000 chars', () => {
    const result = validateIdeaInput('x'.repeat(5001));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Input must be between 10 and 5000 characters');
  });

  it('accepts input within valid range', () => {
    const result = validateIdeaInput('This is a valid idea input');
    expect(result.valid).toBe(true);
  });
});

describe('validateRejectionReason', () => {
  it('accepts reason at minimum length (1 char)', () => {
    const result = validateRejectionReason('x');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts reason at maximum length (1000 chars)', () => {
    const result = validateRejectionReason('r'.repeat(1000));
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects empty reason', () => {
    const result = validateRejectionReason('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Rejection reason must be between 1 and 1000 characters');
  });

  it('rejects reason longer than 1000 chars', () => {
    const result = validateRejectionReason('z'.repeat(1001));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Rejection reason must be between 1 and 1000 characters');
  });
});

describe('validateEditText', () => {
  it('accepts text at minimum length (1 char)', () => {
    const result = validateEditText('e');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts text at maximum length (5000 chars)', () => {
    const result = validateEditText('t'.repeat(5000));
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects empty text', () => {
    const result = validateEditText('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Edit text must be between 1 and 5000 characters');
  });

  it('rejects text longer than 5000 chars', () => {
    const result = validateEditText('w'.repeat(5001));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Edit text must be between 1 and 5000 characters');
  });
});
