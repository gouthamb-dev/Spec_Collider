import type { SpecDraft } from '../types/domain.ts';

export interface SpecDraftPanelProps {
  specDraft: SpecDraft;
  isStreaming: boolean;
  error?: string | null;
  onRetry?: () => void;
}

interface SectionConfig {
  key: keyof Pick<SpecDraft, 'overview' | 'proposedArchitecture' | 'dataModel' | 'apiSurface' | 'assumptions'>;
  label: string;
}

const SECTIONS: SectionConfig[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'proposedArchitecture', label: 'Proposed Architecture' },
  { key: 'dataModel', label: 'Data Model' },
  { key: 'apiSurface', label: 'API Surface' },
  { key: 'assumptions', label: 'Assumptions' },
];

/**
 * SpecDraftPanel displays the current Spec Draft in the left panel.
 *
 * - Shows all 5 sections with headings
 * - Displays streaming indicator while generation is in-progress
 * - Shows error banner with retry button on generation failure
 * - Shows placeholder when sections are empty
 */
export function SpecDraftPanel({ specDraft, isStreaming, error, onRetry }: SpecDraftPanelProps) {
  return (
    <div
      className="flex h-full flex-col bg-surface p-4"
      data-testid="spec-draft-panel"
    >
      {/* Header */}
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-surface-on">Spec Draft</h1>
        {isStreaming && <StreamingIndicator />}
      </header>

      {/* Error Banner */}
      {error && (
        <div
          className="mb-4 flex items-center justify-between rounded-lg bg-error-container px-4 py-3"
          role="alert"
          data-testid="error-banner"
        >
          <span className="text-sm font-medium text-error-on-container">
            {error}
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-3 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-on transition-colors hover:opacity-90"
              data-testid="retry-button"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        {SECTIONS.map((section) => (
          <DraftSection
            key={section.key}
            label={section.label}
            content={specDraft[section.key]}
          />
        ))}
      </div>
    </div>
  );
}

function DraftSection({ label, content }: { label: string; content: string }) {
  const isEmpty = !content || content.trim() === '';

  return (
    <section
      className="rounded-lg border border-outline-variant bg-surface p-4"
      data-testid={`section-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-surface-on-variant">
        {label}
      </h2>
      {isEmpty ? (
        <p className="text-sm italic text-outline" data-testid="section-placeholder">
          No content yet
        </p>
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-surface-on">
          {content}
        </div>
      )}
    </section>
  );
}

function StreamingIndicator() {
  return (
    <div
      className="flex items-center gap-1"
      aria-label="Generating"
      data-testid="streaming-indicator"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: '0ms' }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: '150ms' }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: '300ms' }} />
      <span className="sr-only">Generating spec draft</span>
    </div>
  );
}
