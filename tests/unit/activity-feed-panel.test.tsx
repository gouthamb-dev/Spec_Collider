import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityFeedPanel } from '../../src/components/ActivityFeedPanel.tsx';
import type { ActivityEntry } from '../../src/types/domain.ts';
import type { ModerationAction } from '../../src/types/ui.ts';

// === Factories ===

function createEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    type: 'idea_submitted',
    contributor: 'user',
    content: 'Test content',
    timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    metadata: {},
    streamComplete: true,
    mcpGrounded: false,
    partiallyGrounded: false,
    unavailableProviders: [],
    ...overrides,
  };
}

describe('ActivityFeedPanel', () => {
  let onModerate: (mitigationId: string, action: ModerationAction) => void;

  beforeEach(() => {
    onModerate = vi.fn();
  });

  describe('empty state', () => {
    it('renders empty state message when no entries exist', () => {
      render(
        <ActivityFeedPanel entries={[]} onModerate={onModerate} connectionStatus="connected" />
      );

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No activity yet. Submit an idea to get started.')).toBeInTheDocument();
    });

    it('does not render empty state when entries exist', () => {
      render(
        <ActivityFeedPanel
          entries={[createEntry()]}
          onModerate={onModerate}
          connectionStatus="connected"
        />
      );

      expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    });
  });

  describe('chronological ordering', () => {
    it('displays entries sorted by timestamp ascending', () => {
      const entries = [
        createEntry({ id: 'second', timestamp: Date.now() - 1000, content: 'Second' }),
        createEntry({ id: 'first', timestamp: Date.now() - 5000, content: 'First' }),
        createEntry({ id: 'third', timestamp: Date.now(), content: 'Third' }),
      ];

      render(
        <ActivityFeedPanel entries={entries} onModerate={onModerate} connectionStatus="connected" />
      );

      const entryElements = screen.getAllByText(/First|Second|Third/);
      expect(entryElements[0]).toHaveTextContent('First');
      expect(entryElements[1]).toHaveTextContent('Second');
      expect(entryElements[2]).toHaveTextContent('Third');
    });
  });

  describe('contributor identity', () => {
    it('renders user avatar with correct color', () => {
      render(
        <ActivityFeedPanel
          entries={[createEntry({ contributor: 'user' })]}
          onModerate={onModerate}
          connectionStatus="connected"
        />
      );

      const avatar = screen.getByTestId('avatar-user');
      expect(avatar).toHaveTextContent('U');
      expect(avatar).toHaveStyle({ backgroundColor: '#7C580D' });
    });

    it('renders red_team_agent avatar with error color', () => {
      render(
        <ActivityFeedPanel
          entries={[createEntry({ contributor: 'red_team_agent' })]}
          onModerate={onModerate}
          connectionStatus="connected"
        />
      );

      const avatar = screen.getByTestId('avatar-red_team_agent');
      expect(avatar).toHaveTextContent('R');
      expect(avatar).toHaveStyle({ backgroundColor: '#BA1A1A' });
    });

    it('renders architect_agent avatar with tertiary color', () => {
      render(
        <ActivityFeedPanel
          entries={[createEntry({ contributor: 'architect_agent' })]}
          onModerate={onModerate}
          connectionStatus="connected"
        />
      );

      const avatar = screen.getByTestId('avatar-architect_agent');
      expect(avatar).toHaveTextContent('A');
      expect(avatar).toHaveStyle({ backgroundColor: '#4E6543' });
    });

    it('displays contributor label text', () => {
      render(
        <ActivityFeedPanel
          entries={[createEntry({ contributor: 'red_team_agent' })]}
          onModerate={onModerate}
          connectionStatus="connected"
        />
      );

      expect(screen.getByText('Red Team Agent')).toBeInTheDocument();
    });
  });

  describe('entry action type display', () => {
    it('displays action type label for each entry', () => {
      const entries = [
        createEntry({ type: 'idea_submitted' }),
        createEntry({ type: 'risk_identified', contributor: 'red_team_agent' }),
        createEntry({ type: 'mitigation_proposed', contributor: 'architect_agent' }),
      ];

      render(
        <ActivityFeedPanel entries={entries} onModerate={onModerate} connectionStatus="connected" />
      );

      expect(screen.getByText('Idea Submitted')).toBeInTheDocument();
      expect(screen.getByText('Risk Identified')).toBeInTheDocument();
      expect(screen.getByText('Mitigation Proposed')).toBeInTheDocument();
    });
  });

  describe('moderation controls', () => {
    it('shows Accept, Reject, Edit buttons on completed mitigations', () => {
      const entry = createEntry({
        type: 'mitigation_proposed',
        contributor: 'architect_agent',
        streamComplete: true,
      });

      render(
        <ActivityFeedPanel entries={[entry]} onModerate={onModerate} connectionStatus="connected" />
      );

      expect(screen.getByRole('button', { name: 'Accept mitigation' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reject mitigation' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit mitigation' })).toBeInTheDocument();
    });

    it('does not show moderation controls on incomplete mitigations', () => {
      const entry = createEntry({
        type: 'mitigation_proposed',
        contributor: 'architect_agent',
        streamComplete: false,
      });

      render(
        <ActivityFeedPanel entries={[entry]} onModerate={onModerate} connectionStatus="connected" />
      );

      expect(screen.queryByTestId('moderation-controls')).not.toBeInTheDocument();
    });

    it('does not show moderation controls on non-mitigation entries', () => {
      const entry = createEntry({ type: 'risk_identified', streamComplete: true });

      render(
        <ActivityFeedPanel entries={[entry]} onModerate={onModerate} connectionStatus="connected" />
      );

      expect(screen.queryByTestId('moderation-controls')).not.toBeInTheDocument();
    });

    it('calls onModerate with accept action', () => {
      const entry = createEntry({
        id: 'mit-1',
        type: 'mitigation_proposed',
        contributor: 'architect_agent',
        streamComplete: true,
        metadata: { mitigationId: 'mitigation-abc' },
      });

      render(
        <ActivityFeedPanel entries={[entry]} onModerate={onModerate} connectionStatus="connected" />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Accept mitigation' }));
      expect(onModerate).toHaveBeenCalledWith('mitigation-abc', { type: 'accept' });
    });

    it('calls onModerate with reject action', () => {
      const entry = createEntry({
        type: 'mitigation_proposed',
        contributor: 'architect_agent',
        streamComplete: true,
        metadata: { mitigationId: 'mitigation-xyz' },
      });

      render(
        <ActivityFeedPanel entries={[entry]} onModerate={onModerate} connectionStatus="connected" />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Reject mitigation' }));
      expect(onModerate).toHaveBeenCalledWith('mitigation-xyz', { type: 'reject', reason: '' });
    });

    it('calls onModerate with edit action', () => {
      const entry = createEntry({
        type: 'mitigation_proposed',
        contributor: 'architect_agent',
        streamComplete: true,
        metadata: { mitigationId: 'mitigation-123' },
      });

      render(
        <ActivityFeedPanel entries={[entry]} onModerate={onModerate} connectionStatus="connected" />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Edit mitigation' }));
      expect(onModerate).toHaveBeenCalledWith('mitigation-123', { type: 'edit', modifiedText: '' });
    });
  });

  describe('chaos round banner', () => {
    it('shows chaos banner when chaos_triggered is the latest relevant entry', () => {
      const entries = [
        createEntry({ type: 'idea_submitted', timestamp: 1000 }),
        createEntry({ type: 'chaos_triggered', timestamp: 2000 }),
      ];

      render(
        <ActivityFeedPanel entries={entries} onModerate={onModerate} connectionStatus="connected" />
      );

      expect(screen.getByTestId('chaos-banner')).toBeInTheDocument();
      expect(screen.getByText('Chaos Round in progress')).toBeInTheDocument();
    });

    it('does not show chaos banner when decision_made follows chaos_triggered', () => {
      const entries = [
        createEntry({ type: 'chaos_triggered', timestamp: 1000 }),
        createEntry({ type: 'decision_made', timestamp: 2000 }),
      ];

      render(
        <ActivityFeedPanel entries={entries} onModerate={onModerate} connectionStatus="connected" />
      );

      expect(screen.queryByTestId('chaos-banner')).not.toBeInTheDocument();
    });

    it('does not show chaos banner when no chaos_triggered entry exists', () => {
      const entries = [createEntry({ type: 'idea_submitted' })];

      render(
        <ActivityFeedPanel entries={entries} onModerate={onModerate} connectionStatus="connected" />
      );

      expect(screen.queryByTestId('chaos-banner')).not.toBeInTheDocument();
    });
  });

  describe('connection status indicator', () => {
    it('does not show banner when connected', () => {
      render(
        <ActivityFeedPanel
          entries={[createEntry()]}
          onModerate={onModerate}
          connectionStatus="connected"
        />
      );

      expect(screen.queryByTestId('connection-status-banner')).not.toBeInTheDocument();
    });

    it('shows reconnecting banner', () => {
      render(
        <ActivityFeedPanel
          entries={[createEntry()]}
          onModerate={onModerate}
          connectionStatus="reconnecting"
        />
      );

      const banner = screen.getByTestId('connection-status-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Reconnecting...');
    });

    it('shows disconnected banner', () => {
      render(
        <ActivityFeedPanel
          entries={[createEntry()]}
          onModerate={onModerate}
          connectionStatus="disconnected"
        />
      );

      const banner = screen.getByTestId('connection-status-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Disconnected');
    });
  });

  describe('error entries styling', () => {
    it('renders error entries with error container styling', () => {
      const entry = createEntry({
        id: 'error-entry',
        content: 'Something went wrong',
        metadata: { isError: true },
      });

      render(
        <ActivityFeedPanel entries={[entry]} onModerate={onModerate} connectionStatus="connected" />
      );

      const entryEl = screen.getByTestId('entry-error-entry');
      expect(entryEl).toHaveClass('bg-error-container');
      expect(entryEl).toHaveClass('text-error-on-container');
    });

    it('renders normal entries without error styling', () => {
      const entry = createEntry({ id: 'normal-entry' });

      render(
        <ActivityFeedPanel entries={[entry]} onModerate={onModerate} connectionStatus="connected" />
      );

      const entryEl = screen.getByTestId('entry-normal-entry');
      expect(entryEl).not.toHaveClass('bg-error-container');
    });
  });

  describe('auto-scroll behavior', () => {
    it('renders a scrollable container for entries', () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        createEntry({ id: `e-${i}`, timestamp: Date.now() - (10 - i) * 1000 })
      );

      render(
        <ActivityFeedPanel entries={entries} onModerate={onModerate} connectionStatus="connected" />
      );

      expect(screen.getByTestId('feed-scroll-container')).toBeInTheDocument();
    });
  });

  describe('relative time formatting', () => {
    it('displays relative time for recent entries', () => {
      const entry = createEntry({
        timestamp: Date.now() - 2 * 60 * 1000, // 2 minutes ago
      });

      render(
        <ActivityFeedPanel entries={[entry]} onModerate={onModerate} connectionStatus="connected" />
      );

      expect(screen.getByText('2 minutes ago')).toBeInTheDocument();
    });
  });
});
