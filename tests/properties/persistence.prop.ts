import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  createSaveWithRetry,
  type SaveErrorNotification,
} from '../../src/integration/persistence.ts';
import { arbSession } from '../generators.ts';

// No-op delay for testing (resolves immediately, avoids fake timer issues)
const instantDelay = async (_ms: number): Promise<void> => {};

describe('Feature: spec-collider, Property 21: Save retry logic', () => {
  /**
   * Validates: Requirements 7.4, 7.5
   *
   * For any sequence of consecutive save failures, the system SHALL retry up to
   * exactly 3 times. After the 3rd failure, no further automatic retries SHALL
   * occur and a persistent error notification SHALL be triggered.
   */

  it('retries exactly 3 times after initial failure (4 total attempts), then stops', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSession(),
        async (session) => {
          // A save function that always fails
          const saveFn = vi.fn().mockRejectedValue(new Error('save failed'));
          const notifications: SaveErrorNotification[] = [];

          const saveWithRetry = createSaveWithRetry(saveFn, {
            maxRetries: 3,
            retryDelayMs: 5000,
            onNotification: (n) => notifications.push(n),
            delayFn: instantDelay,
          });

          const result = await saveWithRetry(session);

          // Exactly 4 total attempts: 1 initial + 3 retries
          expect(saveFn).toHaveBeenCalledTimes(4);
          expect(result.success).toBe(false);
          expect(result.attempts).toBe(4);

          // No further automatic retries after exhaustion
          expect(saveFn).toHaveBeenCalledTimes(4);

          // Persistent notification was triggered
          expect(result.notificationTriggered).toBe(true);

          // The last notification is 'exhausted'
          const exhaustedNotifications = notifications.filter((n) => n.type === 'exhausted');
          expect(exhaustedNotifications).toHaveLength(1);
          expect(exhaustedNotifications[0].error).toBeInstanceOf(Error);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('succeeds immediately without retries when save does not fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSession(),
        async (session) => {
          const saveFn = vi.fn().mockResolvedValue(undefined);
          const notifications: SaveErrorNotification[] = [];

          const saveWithRetry = createSaveWithRetry(saveFn, {
            maxRetries: 3,
            retryDelayMs: 5000,
            onNotification: (n) => notifications.push(n),
            delayFn: instantDelay,
          });

          const result = await saveWithRetry(session);

          expect(saveFn).toHaveBeenCalledTimes(1);
          expect(result.success).toBe(true);
          expect(result.attempts).toBe(1);
          expect(result.notificationTriggered).toBe(false);
          expect(notifications).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('stops retrying on first success (partial failure sequences)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSession(),
        fc.integer({ min: 1, max: 3 }), // Succeed after 1, 2, or 3 failures
        async (session, failCount) => {
          let callCount = 0;
          const saveFn = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount <= failCount) {
              throw new Error(`fail attempt ${callCount}`);
            }
            // Success on this attempt
          });
          const notifications: SaveErrorNotification[] = [];

          const saveWithRetry = createSaveWithRetry(saveFn, {
            maxRetries: 3,
            retryDelayMs: 5000,
            onNotification: (n) => notifications.push(n),
            delayFn: instantDelay,
          });

          const result = await saveWithRetry(session);

          // Should have succeeded
          expect(result.success).toBe(true);
          // Attempts = failCount + 1 (the successful one)
          expect(result.attempts).toBe(failCount + 1);
          // No persistent notification since it eventually succeeded
          expect(result.notificationTriggered).toBe(false);
          // No 'exhausted' notification
          expect(notifications.filter((n) => n.type === 'exhausted')).toHaveLength(0);
          // Retry notifications count matches failures
          expect(notifications.filter((n) => n.type === 'retry')).toHaveLength(failCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('triggers persistent error notification only after all retries are exhausted', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSession(),
        fc.string({ minLength: 1, maxLength: 100 }), // arbitrary error message
        async (session, errorMsg) => {
          const saveFn = vi.fn().mockRejectedValue(new Error(errorMsg));
          const notifications: SaveErrorNotification[] = [];

          const saveWithRetry = createSaveWithRetry(saveFn, {
            maxRetries: 3,
            retryDelayMs: 5000,
            onNotification: (n) => notifications.push(n),
            delayFn: instantDelay,
          });

          const result = await saveWithRetry(session);

          // Result indicates failure and notification
          expect(result.success).toBe(false);
          expect(result.notificationTriggered).toBe(true);
          expect(result.lastError).toBeInstanceOf(Error);
          expect(result.lastError!.message).toBe(errorMsg);

          // Exactly 3 retry notifications + 1 exhausted notification
          const retryNotifications = notifications.filter((n) => n.type === 'retry');
          const exhaustedNotifications = notifications.filter((n) => n.type === 'exhausted');
          expect(retryNotifications).toHaveLength(3);
          expect(exhaustedNotifications).toHaveLength(1);

          // Total attempts is exactly 4
          expect(saveFn).toHaveBeenCalledTimes(4);
          expect(result.attempts).toBe(4);
        }
      ),
      { numRuns: 100 }
    );
  });
});
