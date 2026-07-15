import { describe, it, expect, beforeEach } from 'vitest';
import {
  useActivityFeedStore,
  getContributorColor,
  getContributorLabel,
  formatTimestamp,
} from '../../src/core/activity-feed.ts';
import type { ActivityEntry } from '../../src/types/domain.ts';

function makeEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    type: 'idea_submitted',
    contributor: 'user',
    content: 'Test content',
    timestamp: Date.now(),
    metadata: {},
    streamComplete: true,
    mcpGrounded: false,
    partiallyGrounded: false,
    unavailableProviders: [],
    ...overrides,
  };
}

describe('Activity Feed Store', () => {
  beforeEach(() => {
    useActivityFeedStore.getState().clearEntries();
  });

  describe('addEntry', () => {
    it('adds an entry to the store', () => {
      const entry = makeEntry();
      useActivityFeedStore.getState().addEntry(entry);
      expect(useActivityFeedStore.getState().entries).toHaveLength(1);
      expect(useActivityFeedStore.getState().entries[0]).toEqual(entry);
    });

    it('maintains chronological (ascending timestamp) order', () => {
      const entry1 = makeEntry({ id: 'a', timestamp: 300 });
      const entry2 = makeEntry({ id: 'b', timestamp: 100 });
      const entry3 = makeEntry({ id: 'c', timestamp: 200 });

      const store = useActivityFeedStore.getState();
      store.addEntry(entry1);
      store.addEntry(entry2);
      store.addEntry(entry3);

      const entries = useActivityFeedStore.getState().entries;
      expect(entries[0].id).toBe('b'); // timestamp 100
      expect(entries[1].id).toBe('c'); // timestamp 200
      expect(entries[2].id).toBe('a'); // timestamp 300
    });

    it('caps at 500 entries, evicting oldest', () => {
      const store = useActivityFeedStore.getState();
      for (let i = 0; i < 505; i++) {
        store.addEntry(makeEntry({ id: `entry-${i}`, timestamp: i }));
      }
      const entries = useActivityFeedStore.getState().entries;
      expect(entries).toHaveLength(500);
      // Oldest entries (0-4) should be evicted
      expect(entries[0].timestamp).toBe(5);
      expect(entries[entries.length - 1].timestamp).toBe(504);
    });
  });

  describe('createEntry', () => {
    it('creates and adds an entry with correct defaults', () => {
      const store = useActivityFeedStore.getState();
      const entry = store.createEntry(
        'risk_identified',
        'red_team_agent',
        'Found a vulnerability'
      );

      expect(entry.type).toBe('risk_identified');
      expect(entry.contributor).toBe('red_team_agent');
      expect(entry.content).toBe('Found a vulnerability');
      expect(entry.streamComplete).toBe(true);
      expect(entry.mcpGrounded).toBe(false);
      expect(entry.partiallyGrounded).toBe(false);
      expect(entry.unavailableProviders).toEqual([]);
      expect(entry.id).toMatch(/^entry-/);
      expect(entry.timestamp).toBeGreaterThan(0);

      expect(useActivityFeedStore.getState().entries).toHaveLength(1);
    });

    it('creates entries for all event types', () => {
      const types: ActivityEntry['type'][] = [
        'idea_submitted',
        'risk_identified',
        'mitigation_proposed',
        'decision_made',
        'chaos_triggered',
      ];
      const store = useActivityFeedStore.getState();
      for (const type of types) {
        store.createEntry(type, 'user', `Content for ${type}`);
      }
      expect(useActivityFeedStore.getState().entries).toHaveLength(5);
    });

    it('accepts custom metadata', () => {
      const store = useActivityFeedStore.getState();
      const entry = store.createEntry('decision_made', 'user', 'Accepted', {
        mitigationId: 'mit-123',
        action: 'accepted',
      });
      expect(entry.metadata).toEqual({
        mitigationId: 'mit-123',
        action: 'accepted',
      });
    });
  });

  describe('removeEntry', () => {
    it('removes an entry by id', () => {
      const entry = makeEntry({ id: 'to-remove' });
      const store = useActivityFeedStore.getState();
      store.addEntry(entry);
      expect(useActivityFeedStore.getState().entries).toHaveLength(1);

      store.removeEntry('to-remove');
      expect(useActivityFeedStore.getState().entries).toHaveLength(0);
    });
  });

  describe('isEmpty', () => {
    it('returns true when no entries exist', () => {
      expect(useActivityFeedStore.getState().isEmpty()).toBe(true);
    });

    it('returns false when entries exist', () => {
      useActivityFeedStore.getState().addEntry(makeEntry());
      expect(useActivityFeedStore.getState().isEmpty()).toBe(false);
    });
  });

  describe('clearEntries', () => {
    it('removes all entries', () => {
      const store = useActivityFeedStore.getState();
      store.addEntry(makeEntry({ id: '1' }));
      store.addEntry(makeEntry({ id: '2' }));
      expect(useActivityFeedStore.getState().entries).toHaveLength(2);

      store.clearEntries();
      expect(useActivityFeedStore.getState().entries).toHaveLength(0);
    });
  });
});

describe('getContributorColor', () => {
  it('returns Primary color for user', () => {
    expect(getContributorColor('user')).toBe('#7C580D');
  });

  it('returns Error color for red_team_agent', () => {
    expect(getContributorColor('red_team_agent')).toBe('#BA1A1A');
  });

  it('returns Tertiary color for architect_agent', () => {
    expect(getContributorColor('architect_agent')).toBe('#4E6543');
  });

  it('returns distinct colors for all contributors', () => {
    const colors = new Set([
      getContributorColor('user'),
      getContributorColor('red_team_agent'),
      getContributorColor('architect_agent'),
    ]);
    expect(colors.size).toBe(3);
  });
});

describe('getContributorLabel', () => {
  it('returns correct labels', () => {
    expect(getContributorLabel('user')).toBe('User');
    expect(getContributorLabel('red_team_agent')).toBe('Red Team Agent');
    expect(getContributorLabel('architect_agent')).toBe('Architect Agent');
  });
});

describe('formatTimestamp', () => {
  const NOW = 1700000000000; // Fixed reference time

  it('returns "just now" for timestamps less than 60 seconds ago', () => {
    expect(formatTimestamp(NOW - 30_000, NOW)).toBe('just now');
    expect(formatTimestamp(NOW - 59_000, NOW)).toBe('just now');
    expect(formatTimestamp(NOW, NOW)).toBe('just now');
  });

  it('returns "1 minute ago" for exactly 1 minute', () => {
    expect(formatTimestamp(NOW - 60_000, NOW)).toBe('1 minute ago');
    expect(formatTimestamp(NOW - 90_000, NOW)).toBe('1 minute ago');
  });

  it('returns "N minutes ago" for multiple minutes', () => {
    expect(formatTimestamp(NOW - 2 * 60_000, NOW)).toBe('2 minutes ago');
    expect(formatTimestamp(NOW - 45 * 60_000, NOW)).toBe('45 minutes ago');
  });

  it('returns "1 hour ago" for exactly 1 hour', () => {
    expect(formatTimestamp(NOW - 60 * 60_000, NOW)).toBe('1 hour ago');
  });

  it('returns "N hours ago" for multiple hours', () => {
    expect(formatTimestamp(NOW - 2 * 60 * 60_000, NOW)).toBe('2 hours ago');
    expect(formatTimestamp(NOW - 23 * 60 * 60_000, NOW)).toBe('23 hours ago');
  });

  it('returns YYYY-MM-DD HH:MM for timestamps ≥ 24 hours old', () => {
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    const oldTimestamp = NOW - twentyFourHoursMs;
    const result = formatTimestamp(oldTimestamp, NOW);
    // Should match YYYY-MM-DD HH:MM pattern
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('returns correct YYYY-MM-DD HH:MM format', () => {
    // 2023-01-15 10:30:00 UTC
    const knownTimestamp = new Date(2023, 0, 15, 10, 30, 0).getTime();
    const farFuture = knownTimestamp + 25 * 60 * 60 * 1000; // 25h later
    const result = formatTimestamp(knownTimestamp, farFuture);
    expect(result).toBe('2023-01-15 10:30');
  });
});
