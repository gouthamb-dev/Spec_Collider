import { useRef, useEffect, useCallback, useState } from 'react';
import type { ActivityEntry } from '../types/domain.ts';
import type { ConnectionStatus, ModerationAction } from '../types/ui.ts';
import {
  formatTimestamp,
  getContributorColor,
  getContributorLabel,
} from '../core/activity-feed.ts';

// === Props ===

export interface ActivityFeedPanelProps {
  entries: ActivityEntry[];
  onModerate: (mitigationId: string, action: ModerationAction) => void;
  connectionStatus: ConnectionStatus;
}

// === Constants ===

const CONTRIBUTOR_AVATARS: Record<ActivityEntry['contributor'], string> = {
  user: 'U',
  red_team_agent: 'R',
  architect_agent: 'A',
};

const ENTRY_TYPE_LABELS: Record<ActivityEntry['type'], string> = {
  idea_submitted: 'Idea Submitted',
  risk_identified: 'Risk Identified',
  mitigation_proposed: 'Mitigation Proposed',
  decision_made: 'Decision Made',
  chaos_triggered: 'Chaos Triggered',
};

// === Helper: detect if chaos round is active ===

function isChaosRoundActive(entries: ActivityEntry[]): boolean {
  // A chaos round is active if the last chaos_triggered entry exists
  // and there's no subsequent entry that ends it (heuristic: chaos is active if
  // the most recent chaos_triggered entry has no decision_made after it)
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].type === 'chaos_triggered') {
      return true;
    }
    if (entries[i].type === 'decision_made') {
      return false;
    }
  }
  return false;
}

// === Sub-components ===

function ConnectionStatusBanner({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') return null;

  const isReconnecting = status === 'reconnecting';
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-error-container text-error-on-container text-sm font-medium"
      role="alert"
      aria-live="polite"
      data-testid="connection-status-banner"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${isReconnecting ? 'bg-primary animate-pulse' : 'bg-error'}`}
      />
      {isReconnecting ? 'Reconnecting...' : 'Disconnected'}
    </div>
  );
}

function ChaosBanner() {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-error-container text-error-on-container text-sm font-medium"
      role="status"
      aria-live="polite"
      data-testid="chaos-banner"
    >
      <span className="inline-block h-2 w-2 rounded-full bg-error animate-pulse" />
      Chaos Round in progress
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex h-full items-center justify-center p-8"
      data-testid="empty-state"
    >
      <p className="text-center text-surface-on-variant">
        No activity yet. Submit an idea to get started.
      </p>
    </div>
  );
}

function ContributorAvatar({ contributor }: { contributor: ActivityEntry['contributor'] }) {
  const color = getContributorColor(contributor);
  const letter = CONTRIBUTOR_AVATARS[contributor];

  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: color }}
      aria-label={getContributorLabel(contributor)}
      data-testid={`avatar-${contributor}`}
    >
      {letter}
    </div>
  );
}

function ModerationControls({
  entry,
  onModerate,
}: {
  entry: ActivityEntry;
  onModerate: (mitigationId: string, action: ModerationAction) => void;
}) {
  const mitigationId = (entry.metadata?.mitigationId as string) ?? entry.id;

  return (
    <div className="mt-2 flex gap-2" data-testid="moderation-controls">
      <button
        className="rounded-md bg-tertiary px-3 py-1 text-xs font-medium text-tertiary-on transition-colors hover:opacity-90"
        onClick={() => onModerate(mitigationId, { type: 'accept' })}
        aria-label="Accept mitigation"
      >
        Accept
      </button>
      <button
        className="rounded-md bg-error px-3 py-1 text-xs font-medium text-error-on transition-colors hover:opacity-90"
        onClick={() => onModerate(mitigationId, { type: 'reject', reason: '' })}
        aria-label="Reject mitigation"
      >
        Reject
      </button>
      <button
        className="rounded-md bg-secondary px-3 py-1 text-xs font-medium text-secondary-on transition-colors hover:opacity-90"
        onClick={() => onModerate(mitigationId, { type: 'edit', modifiedText: '' })}
        aria-label="Edit mitigation"
      >
        Edit
      </button>
    </div>
  );
}

function ActivityEntryItem({
  entry,
  onModerate,
}: {
  entry: ActivityEntry;
  onModerate: (mitigationId: string, action: ModerationAction) => void;
}) {
  const color = getContributorColor(entry.contributor);
  const label = getContributorLabel(entry.contributor);
  const typeLabel = ENTRY_TYPE_LABELS[entry.type];
  const timeStr = formatTimestamp(entry.timestamp);

  // Determine if this is an error entry (from metadata)
  const isError = entry.metadata?.isError === true;

  // Determine if moderation controls should be shown
  const showModeration =
    entry.type === 'mitigation_proposed' && entry.streamComplete;

  const containerClasses = isError
    ? 'rounded-lg p-3 bg-error-container text-error-on-container'
    : 'rounded-lg p-3 bg-surface-container';

  return (
    <div
      className={containerClasses}
      data-testid={`entry-${entry.id}`}
      data-entry-type={entry.type}
    >
      <div className="flex items-start gap-3">
        <ContributorAvatar contributor={entry.contributor} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium" style={{ color }}>
              {label}
            </span>
            <span className="text-xs text-surface-on-variant">{typeLabel}</span>
            <span className="ml-auto text-xs text-surface-on-variant whitespace-nowrap">
              {timeStr}
            </span>
          </div>
          <p className={`mt-1 text-sm ${isError ? 'text-error-on-container' : 'text-surface-on'}`}>
            {entry.content}
          </p>
          {showModeration && (
            <ModerationControls entry={entry} onModerate={onModerate} />
          )}
        </div>
      </div>
    </div>
  );
}

// === Main Component ===

export function ActivityFeedPanel({
  entries,
  onModerate,
  connectionStatus,
}: ActivityFeedPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const prevEntryCountRef = useRef(entries.length);

  // Detect if user has scrolled up from the bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setUserScrolledUp(!isAtBottom);
  }, []);

  // Auto-scroll to bottom when new entries arrive, unless user scrolled up
  useEffect(() => {
    if (entries.length > prevEntryCountRef.current && !userScrolledUp) {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
    prevEntryCountRef.current = entries.length;
  }, [entries.length, userScrolledUp]);

  // Sort entries chronologically
  const sortedEntries = [...entries].sort((a, b) => a.timestamp - b.timestamp);

  const chaosActive = isChaosRoundActive(sortedEntries);
  const isEmpty = entries.length === 0;

  return (
    <div
      className="flex h-full flex-col"
      data-testid="activity-feed-panel"
      aria-label="Activity Feed"
    >
      {/* Connection status banner */}
      <ConnectionStatusBanner status={connectionStatus} />

      {/* Chaos round banner */}
      {chaosActive && <ChaosBanner />}

      {/* Feed content */}
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4"
          onScroll={handleScroll}
          data-testid="feed-scroll-container"
        >
          <div className="flex flex-col gap-3">
            {sortedEntries.map((entry) => (
              <ActivityEntryItem
                key={entry.id}
                entry={entry}
                onModerate={onModerate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
