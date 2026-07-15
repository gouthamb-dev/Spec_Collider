import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SpecDraftPanel } from '../../src/components/SpecDraftPanel.tsx';
import type { SpecDraft } from '../../src/types/domain.ts';

function makeSpecDraft(overrides: Partial<SpecDraft> = {}): SpecDraft {
  return {
    overview: 'An overview of the system.',
    proposedArchitecture: 'Microservices with event sourcing.',
    dataModel: 'PostgreSQL with normalized tables.',
    apiSurface: 'REST API with versioned endpoints.',
    assumptions: 'Team has experience with TypeScript.',
    lastModified: Date.now(),
    version: 1,
    ...overrides,
  };
}

describe('SpecDraftPanel', () => {
  it('renders all 5 sections with headings and content', () => {
    const draft = makeSpecDraft();
    render(<SpecDraftPanel specDraft={draft} isStreaming={false} />);

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Proposed Architecture')).toBeInTheDocument();
    expect(screen.getByText('Data Model')).toBeInTheDocument();
    expect(screen.getByText('API Surface')).toBeInTheDocument();
    expect(screen.getByText('Assumptions')).toBeInTheDocument();

    expect(screen.getByText(draft.overview)).toBeInTheDocument();
    expect(screen.getByText(draft.proposedArchitecture)).toBeInTheDocument();
    expect(screen.getByText(draft.dataModel)).toBeInTheDocument();
    expect(screen.getByText(draft.apiSurface)).toBeInTheDocument();
    expect(screen.getByText(draft.assumptions)).toBeInTheDocument();
  });

  it('shows placeholder text for empty sections', () => {
    const draft = makeSpecDraft({
      overview: '',
      proposedArchitecture: '',
      dataModel: '',
      apiSurface: '',
      assumptions: '',
    });
    render(<SpecDraftPanel specDraft={draft} isStreaming={false} />);

    const placeholders = screen.getAllByTestId('section-placeholder');
    expect(placeholders).toHaveLength(5);
    placeholders.forEach((el) => {
      expect(el).toHaveTextContent('No content yet');
    });
  });

  it('displays streaming indicator when isStreaming is true', () => {
    const draft = makeSpecDraft();
    render(<SpecDraftPanel specDraft={draft} isStreaming={true} />);

    expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument();
    expect(screen.getByText('Generating spec draft')).toBeInTheDocument();
  });

  it('does not display streaming indicator when isStreaming is false', () => {
    const draft = makeSpecDraft();
    render(<SpecDraftPanel specDraft={draft} isStreaming={false} />);

    expect(screen.queryByTestId('streaming-indicator')).not.toBeInTheDocument();
  });

  it('displays error banner with message when error prop is provided', () => {
    const draft = makeSpecDraft();
    render(
      <SpecDraftPanel
        specDraft={draft}
        isStreaming={false}
        error="Generation failed: timeout"
      />
    );

    const banner = screen.getByTestId('error-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('Generation failed: timeout');
  });

  it('does not display error banner when error is null', () => {
    const draft = makeSpecDraft();
    render(<SpecDraftPanel specDraft={draft} isStreaming={false} error={null} />);

    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', () => {
    const draft = makeSpecDraft();
    const onRetry = vi.fn();
    render(
      <SpecDraftPanel
        specDraft={draft}
        isStreaming={false}
        error="Something went wrong"
        onRetry={onRetry}
      />
    );

    const retryButton = screen.getByTestId('retry-button');
    fireEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render retry button when onRetry is not provided', () => {
    const draft = makeSpecDraft();
    render(
      <SpecDraftPanel
        specDraft={draft}
        isStreaming={false}
        error="Something went wrong"
      />
    );

    expect(screen.queryByTestId('retry-button')).not.toBeInTheDocument();
  });

  it('has proper accessibility: error banner has role="alert"', () => {
    const draft = makeSpecDraft();
    render(
      <SpecDraftPanel
        specDraft={draft}
        isStreaming={false}
        error="Error occurred"
        onRetry={() => {}}
      />
    );

    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();
  });

  it('renders heading hierarchy correctly', () => {
    const draft = makeSpecDraft();
    render(<SpecDraftPanel specDraft={draft} isStreaming={false} />);

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Spec Draft');

    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s).toHaveLength(5);
  });

  it('shows placeholder for whitespace-only sections', () => {
    const draft = makeSpecDraft({ overview: '   ', dataModel: '\n\t' });
    render(<SpecDraftPanel specDraft={draft} isStreaming={false} />);

    const overviewSection = screen.getByTestId('section-overview');
    expect(overviewSection.querySelector('[data-testid="section-placeholder"]')).toBeInTheDocument();

    const dataModelSection = screen.getByTestId('section-data-model');
    expect(dataModelSection.querySelector('[data-testid="section-placeholder"]')).toBeInTheDocument();
  });
});
