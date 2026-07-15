import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WorkspaceLayout } from '../../src/components/WorkspaceLayout';

describe('WorkspaceLayout', () => {
  describe('Wide viewport (≥1280px) — three-panel layout', () => {
    it('renders all three panels simultaneously', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={1280} />
      );

      expect(screen.getByLabelText('Spec Draft')).toBeInTheDocument();
      expect(screen.getByLabelText('Activity Feed')).toBeInTheDocument();
      expect(screen.getByLabelText('Artifacts')).toBeInTheDocument();
    });

    it('each panel has min-width of 300px', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={1440} />
      );

      const specDraft = screen.getByTestId('panel-spec-draft');
      const activityFeed = screen.getByTestId('panel-activity-feed');
      const artifacts = screen.getByTestId('panel-artifacts');

      expect(specDraft.className).toContain('min-w-[300px]');
      expect(activityFeed.className).toContain('min-w-[300px]');
      expect(artifacts.className).toContain('min-w-[300px]');
    });

    it('renders custom children in each panel', () => {
      render(
        <WorkspaceLayout
          sessionId="test-session"
          viewportWidth={1280}
          children={{
            specDraft: <div data-testid="custom-spec">My Spec</div>,
            activityFeed: <div data-testid="custom-feed">My Feed</div>,
            artifacts: <div data-testid="custom-artifacts">My Artifacts</div>,
          }}
        />
      );

      expect(screen.getByTestId('custom-spec')).toBeInTheDocument();
      expect(screen.getByTestId('custom-feed')).toBeInTheDocument();
      expect(screen.getByTestId('custom-artifacts')).toBeInTheDocument();
    });

    it('does not render tab navigation in wide viewport', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={1280} />
      );

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('applies MD3 background color token', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={1280} />
      );

      const layout = screen.getByTestId('workspace-layout');
      expect(layout.className).toContain('bg-background');
    });

    it('stores the session ID as a data attribute', () => {
      render(
        <WorkspaceLayout sessionId="abc-123" viewportWidth={1920} />
      );

      const layout = screen.getByTestId('workspace-layout');
      expect(layout.dataset.sessionId).toBe('abc-123');
    });
  });

  describe('Narrow viewport (<1280px) — tabbed layout', () => {
    it('renders tabbed navigation instead of three panels', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={1024} />
      );

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Spec Draft' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Activity Feed' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Artifacts' })).toBeInTheDocument();
    });

    it('defaults to Spec Draft tab selected', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={800} />
      );

      const specTab = screen.getByRole('tab', { name: 'Spec Draft' });
      expect(specTab).toHaveAttribute('aria-selected', 'true');
    });

    it('switches to Activity Feed tab on click', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={800} />
      );

      const feedTab = screen.getByRole('tab', { name: 'Activity Feed' });
      fireEvent.click(feedTab);

      expect(feedTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Spec Draft' })).toHaveAttribute(
        'aria-selected',
        'false'
      );
    });

    it('switches to Artifacts tab on click', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={600} />
      );

      const artifactsTab = screen.getByRole('tab', { name: 'Artifacts' });
      fireEvent.click(artifactsTab);

      expect(artifactsTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('panel-artifacts')).toBeInTheDocument();
    });

    it('shows only one panel at a time', () => {
      render(
        <WorkspaceLayout
          sessionId="test-session"
          viewportWidth={768}
          children={{
            specDraft: <div data-testid="custom-spec">Spec</div>,
            activityFeed: <div data-testid="custom-feed">Feed</div>,
            artifacts: <div data-testid="custom-artifacts">Artifacts</div>,
          }}
        />
      );

      // Initially shows spec draft
      expect(screen.getByTestId('custom-spec')).toBeInTheDocument();
      expect(screen.queryByTestId('custom-feed')).not.toBeInTheDocument();
      expect(screen.queryByTestId('custom-artifacts')).not.toBeInTheDocument();

      // Switch to activity feed
      fireEvent.click(screen.getByRole('tab', { name: 'Activity Feed' }));
      expect(screen.queryByTestId('custom-spec')).not.toBeInTheDocument();
      expect(screen.getByTestId('custom-feed')).toBeInTheDocument();
      expect(screen.queryByTestId('custom-artifacts')).not.toBeInTheDocument();
    });

    it('renders tabpanel with correct ARIA attributes', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={768} />
      );

      const tabpanel = screen.getByRole('tabpanel');
      expect(tabpanel).toHaveAttribute('id', 'tabpanel-spec-draft');
      expect(tabpanel).toHaveAttribute('aria-labelledby', 'tab-spec-draft');
    });

    it('applies MD3 design tokens to tabs', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={768} />
      );

      const activeTab = screen.getByRole('tab', { name: 'Spec Draft' });
      expect(activeTab.className).toContain('text-primary');
      expect(activeTab.className).toContain('border-primary');
    });
  });

  describe('Boundary behavior at 1280px', () => {
    it('renders three panels at exactly 1280px', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={1280} />
      );

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Spec Draft')).toBeInTheDocument();
      expect(screen.getByLabelText('Activity Feed')).toBeInTheDocument();
      expect(screen.getByLabelText('Artifacts')).toBeInTheDocument();
    });

    it('renders tabbed view at 1279px', () => {
      render(
        <WorkspaceLayout sessionId="test-session" viewportWidth={1279} />
      );

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      // In tabbed view, only one panel is visible at a time (no simultaneous three panels)
      expect(screen.queryByTestId('panel-activity-feed')).not.toBeInTheDocument();
      expect(screen.queryByTestId('panel-artifacts')).not.toBeInTheDocument();
    });
  });
});
