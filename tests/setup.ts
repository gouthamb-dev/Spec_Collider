import '@testing-library/jest-dom';

// Shared test utilities for Spec Collider

/**
 * Default number of iterations for property-based tests.
 * Ensures adequate coverage per the design doc requirement of 100+ iterations.
 */
export const PBT_NUM_RUNS = 100;

/**
 * Creates a timestamp within the last 24 hours (for testing relative time formatting).
 */
export function recentTimestamp(): number {
  return Date.now() - Math.floor(Math.random() * 23 * 60 * 60 * 1000);
}

/**
 * Creates a timestamp older than 24 hours (for testing date-time formatting).
 */
export function oldTimestamp(): number {
  return Date.now() - (24 * 60 * 60 * 1000 + Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000));
}
