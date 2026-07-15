import type { ValidationResult } from '../types/ui.ts';

/**
 * Validates idea input text.
 * Accepts strings with length between 10 and 5000 characters inclusive.
 */
export function validateIdeaInput(text: string): ValidationResult {
  if (text.length < 10 || text.length > 5000) {
    return {
      valid: false,
      error: 'Input must be between 10 and 5000 characters',
    };
  }
  return { valid: true };
}

/**
 * Validates rejection reason text.
 * Accepts strings with length between 1 and 1000 characters inclusive.
 */
export function validateRejectionReason(reason: string): ValidationResult {
  if (reason.length < 1 || reason.length > 1000) {
    return {
      valid: false,
      error: 'Rejection reason must be between 1 and 1000 characters',
    };
  }
  return { valid: true };
}

/**
 * Validates edit text.
 * Accepts strings with length between 1 and 5000 characters inclusive.
 */
export function validateEditText(text: string): ValidationResult {
  if (text.length < 1 || text.length > 5000) {
    return {
      valid: false,
      error: 'Edit text must be between 1 and 5000 characters',
    };
  }
  return { valid: true };
}
