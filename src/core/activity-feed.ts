import { create } from 'zustand';
import type { ActivityEntry } from '../types/domain.ts';

// === Constants ===

const MAX_ENTRIES = 500;

// === Contributor Color Mapping (Design System MD3 tokens) ===

const CONTRIBUTOR_COLORS = {
  user: '#7C580D',           // Primary
  red_team_agent: '#BA1A1A', // Error
  architect_agent: '#4E6543', // Tertiary
} as const;

const CONTRIBUTOR_LABELS = {
  user: 'User',
  red_team_agent: 'Red Team Agent',
  architect_agent: 'Architect Agent',
} as const;

// === Types ===

export type ContributorRole = ActivityEntry['contributor'];
export type EntryType = ActivityEntry['type'];

export interface ActivityFeedState {
  entries: ActivityEntry[];
  addEntry: (entry: ActivityEntry) => void;
  createEntry: (
    type: EntryType,
    contributor: ContributorRole,
    content: string,
    metadata?: Record<string, unknown>
  ) => ActivityEntry;
  removeEntry: (id: string) => void;
  clearEntries: () => void;
  isEmpty: () => boolean;
}

// === Utility Functions ===

/**
 * Returns the Design System color token for a contributor role.
 * - user → Primary (#7C580D)
 * - red_team_agent → Error (#BA1A1A)
 * - architect_agent → Tertiary (#4E6543)
 */
export function getContributorColor(contributor: ContributorRole): string {
  return CONTRIBUTOR_COLORS[contributor];
}

/**
 * Returns a human-readable display label for a contributor role.
 */
export function getContributorLabel(contributor: ContributorRole): string {
  return CONTRIBUTOR_LABELS[contributor];
}

/**
 * Formats a timestamp for display in the Activity Feed.
 * - <24h from now: relative time ("just now", "1 minute ago", "2 hours ago", etc.)
 * - ≥24h from now: "YYYY-MM-DD HH:MM" format
 */
export function formatTimestamp(timestamp: number, now?: number): string {
  const currentTime = now ?? Date.now();
  const diffMs = currentTime - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  if (diffMs >= TWENTY_FOUR_HOURS_MS) {
    // ≥24h: format as YYYY-MM-DD HH:MM
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  // <24h: relative time
  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffMinutes === 1) {
    return '1 minute ago';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }
  if (diffHours === 1) {
    return '1 hour ago';
  }
  return `${diffHours} hours ago`;
}

/**
 * Generates a unique ID for an activity entry.
 */
function generateEntryId(): string {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// === Zustand Store ===

export const useActivityFeedStore = create<ActivityFeedState>((set, get) => ({
  entries: [],

  addEntry: (entry: ActivityEntry) => {
    set((state) => {
      const newEntries = [...state.entries, entry].sort(
        (a, b) => a.timestamp - b.timestamp
      );

      // Cap at MAX_ENTRIES, evict oldest when exceeded
      if (newEntries.length > MAX_ENTRIES) {
        return { entries: newEntries.slice(newEntries.length - MAX_ENTRIES) };
      }

      return { entries: newEntries };
    });
  },

  createEntry: (
    type: EntryType,
    contributor: ContributorRole,
    content: string,
    metadata: Record<string, unknown> = {}
  ): ActivityEntry => {
    const entry: ActivityEntry = {
      id: generateEntryId(),
      type,
      contributor,
      content,
      timestamp: Date.now(),
      metadata,
      streamComplete: true,
      mcpGrounded: false,
      partiallyGrounded: false,
      unavailableProviders: [],
    };

    get().addEntry(entry);
    return entry;
  },

  removeEntry: (id: string) => {
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
    }));
  },

  clearEntries: () => {
    set({ entries: [] });
  },

  isEmpty: () => {
    return get().entries.length === 0;
  },
}));
