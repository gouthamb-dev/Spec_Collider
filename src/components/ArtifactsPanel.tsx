import type { VersionedArtifact } from '../types/domain.ts';

export interface ArtifactsPanelProps {
  artifacts: VersionedArtifact[];
  selectedVersion?: number;
  onVersionSelect: (artifactId: string, version: number) => void;
  exportErrors?: { path: string; error: string }[];
  onRetryExport?: () => void;
}

/**
 * Formats the artifact type into a human-readable heading.
 */
function formatArtifactType(type: VersionedArtifact['type']): string {
  const labels: Record<VersionedArtifact['type'], string> = {
    requirements: 'Requirements',
    design: 'Design',
    tasks: 'Tasks',
    adr: 'ADR',
    steering_rules: 'Steering Rules',
  };
  return labels[type];
}

/**
 * ArtifactsPanel renders the right panel displaying generated artifacts.
 *
 * - Shows each artifact as formatted content with full scrolling
 * - Provides version selector dropdown for versioned artifacts
 * - Displays export errors per-file with "Retry Export" action
 * - Uses MD3 design tokens via Tailwind utilities
 */
export function ArtifactsPanel({
  artifacts,
  selectedVersion,
  onVersionSelect,
  exportErrors,
  onRetryExport,
}: ArtifactsPanelProps) {
  // Export errors banner
  const errorBanner = exportErrors && exportErrors.length > 0 && (
    <div
      className="mx-4 mt-4 rounded-lg bg-error-container p-4"
      role="alert"
      data-testid="export-errors"
    >
      <h3 className="mb-2 text-sm font-medium text-error-on-container">
        Export Errors
      </h3>
      <ul className="mb-3 space-y-1">
        {exportErrors.map((err) => (
          <li
            key={err.path}
            className="text-sm text-error-on-container"
            data-testid="export-error-item"
          >
            <span className="font-mono text-xs">{err.path}</span>
            <span className="ml-2">— {err.error}</span>
          </li>
        ))}
      </ul>
      {onRetryExport && (
        <button
          type="button"
          onClick={onRetryExport}
          className="rounded-md bg-error px-3 py-1.5 text-sm font-medium text-error-on transition-colors hover:opacity-90"
          data-testid="retry-export-button"
        >
          Retry Export
        </button>
      )}
    </div>
  );

  // Empty state
  if (artifacts.length === 0) {
    return (
      <div className="flex h-full flex-col" data-testid="artifacts-panel">
        {errorBanner}
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-center text-surface-on-variant" data-testid="artifacts-empty-state">
            No artifacts generated yet. Finalize the spec to generate artifacts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto" data-testid="artifacts-panel">
      {errorBanner}
      <div className="space-y-4 p-4">
        {artifacts.map((artifact) => {
          const currentVer = selectedVersion
            ? artifact.versions.find((v) => v.version === selectedVersion)
            : artifact.versions.find((v) => v.version === artifact.currentVersion);
          const displayVersion = currentVer ?? artifact.versions[artifact.versions.length - 1];

          return (
            <article
              key={artifact.artifactId}
              className="rounded-lg border border-outline-variant bg-surface-container p-4"
              data-testid={`artifact-card-${artifact.artifactId}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-medium text-surface-on">
                  {formatArtifactType(artifact.type)}
                </h2>
                {artifact.versions.length > 1 && (
                  <select
                    value={displayVersion?.version ?? artifact.currentVersion}
                    onChange={(e) =>
                      onVersionSelect(artifact.artifactId, Number(e.target.value))
                    }
                    className="rounded-md border border-outline-variant bg-surface px-2 py-1 text-sm text-surface-on"
                    aria-label={`Version selector for ${formatArtifactType(artifact.type)}`}
                    data-testid={`version-select-${artifact.artifactId}`}
                  >
                    {artifact.versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div
                className="max-h-96 overflow-y-auto rounded-md bg-surface-container-high p-3"
                data-testid={`artifact-content-${artifact.artifactId}`}
              >
                <pre className="whitespace-pre-wrap break-words">{displayVersion?.content ?? ''}</pre>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
