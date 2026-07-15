import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ArtifactsPanel } from '../../src/components/ArtifactsPanel.tsx';
import type { VersionedArtifact } from '../../src/types/domain.ts';

function makeArtifact(overrides?: Partial<VersionedArtifact>): VersionedArtifact {
  return {
    artifactId: 'art-1',
    type: 'requirements',
    versions: [
      { version: 1, content: '# Requirements v1\n\nFirst version content.', generatedAt: 1000 },
    ],
    currentVersion: 1,
    ...overrides,
  };
}

function makeMultiVersionArtifact(): VersionedArtifact {
  return {
    artifactId: 'art-multi',
    type: 'design',
    versions: [
      { version: 1, content: 'Design v1 content', generatedAt: 1000 },
      { version: 2, content: 'Design v2 content', generatedAt: 2000 },
      { version: 3, content: 'Design v3 content', generatedAt: 3000 },
    ],
    currentVersion: 3,
  };
}

describe('ArtifactsPanel', () => {
  it('renders empty state when no artifacts exist', () => {
    render(
      <ArtifactsPanel artifacts={[]} onVersionSelect={vi.fn()} />
    );

    expect(screen.getByTestId('artifacts-empty-state')).toHaveTextContent(
      'No artifacts generated yet. Finalize the spec to generate artifacts.'
    );
  });

  it('renders artifact cards with type headings', () => {
    const artifacts: VersionedArtifact[] = [
      makeArtifact({ artifactId: 'a1', type: 'requirements' }),
      makeArtifact({ artifactId: 'a2', type: 'design' }),
      makeArtifact({ artifactId: 'a3', type: 'tasks' }),
      makeArtifact({ artifactId: 'a4', type: 'adr' }),
      makeArtifact({ artifactId: 'a5', type: 'steering_rules' }),
    ];

    render(<ArtifactsPanel artifacts={artifacts} onVersionSelect={vi.fn()} />);

    expect(screen.getByText('Requirements')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('ADR')).toBeInTheDocument();
    expect(screen.getByText('Steering Rules')).toBeInTheDocument();
  });

  it('renders artifact content as preformatted text with full scrolling', () => {
    const artifact = makeArtifact({
      versions: [{ version: 1, content: '# Hello\n\nWorld', generatedAt: 1000 }],
    });

    render(<ArtifactsPanel artifacts={[artifact]} onVersionSelect={vi.fn()} />);

    const contentArea = screen.getByTestId('artifact-content-art-1');
    expect(contentArea).toHaveTextContent('# Hello');
    expect(contentArea).toHaveTextContent('World');
    // Should have overflow-y-auto for scrolling
    expect(contentArea.className).toContain('overflow-y-auto');
  });

  it('shows version selector dropdown when multiple versions exist', () => {
    const artifact = makeMultiVersionArtifact();

    render(<ArtifactsPanel artifacts={[artifact]} onVersionSelect={vi.fn()} />);

    const select = screen.getByTestId('version-select-art-multi');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('3'); // Current version

    // Should have 3 options
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent('v1');
    expect(options[1]).toHaveTextContent('v2');
    expect(options[2]).toHaveTextContent('v3');
  });

  it('does not show version selector for single-version artifacts', () => {
    const artifact = makeArtifact();

    render(<ArtifactsPanel artifacts={[artifact]} onVersionSelect={vi.fn()} />);

    expect(screen.queryByTestId('version-select-art-1')).not.toBeInTheDocument();
  });

  it('calls onVersionSelect when version is changed', () => {
    const onVersionSelect = vi.fn();
    const artifact = makeMultiVersionArtifact();

    render(<ArtifactsPanel artifacts={[artifact]} onVersionSelect={onVersionSelect} />);

    const select = screen.getByTestId('version-select-art-multi');
    fireEvent.change(select, { target: { value: '1' } });

    expect(onVersionSelect).toHaveBeenCalledWith('art-multi', 1);
  });

  it('displays the selected version content', () => {
    const artifact = makeMultiVersionArtifact();

    render(
      <ArtifactsPanel
        artifacts={[artifact]}
        selectedVersion={2}
        onVersionSelect={vi.fn()}
      />
    );

    const contentArea = screen.getByTestId('artifact-content-art-multi');
    expect(contentArea).toHaveTextContent('Design v2 content');
  });

  it('displays export errors with file paths and error messages', () => {
    const errors = [
      { path: '.kiro/specs/requirements.md', error: 'Permission denied' },
      { path: '.kiro/specs/design.md', error: 'Disk full' },
    ];

    render(
      <ArtifactsPanel
        artifacts={[makeArtifact()]}
        exportErrors={errors}
        onVersionSelect={vi.fn()}
        onRetryExport={vi.fn()}
      />
    );

    const errorBanner = screen.getByTestId('export-errors');
    expect(errorBanner).toBeInTheDocument();

    const errorItems = screen.getAllByTestId('export-error-item');
    expect(errorItems).toHaveLength(2);
    expect(errorItems[0]).toHaveTextContent('.kiro/specs/requirements.md');
    expect(errorItems[0]).toHaveTextContent('Permission denied');
    expect(errorItems[1]).toHaveTextContent('.kiro/specs/design.md');
    expect(errorItems[1]).toHaveTextContent('Disk full');
  });

  it('shows Retry Export button when onRetryExport is provided', () => {
    const onRetryExport = vi.fn();

    render(
      <ArtifactsPanel
        artifacts={[makeArtifact()]}
        exportErrors={[{ path: 'file.md', error: 'fail' }]}
        onVersionSelect={vi.fn()}
        onRetryExport={onRetryExport}
      />
    );

    const retryButton = screen.getByTestId('retry-export-button');
    expect(retryButton).toHaveTextContent('Retry Export');

    fireEvent.click(retryButton);
    expect(onRetryExport).toHaveBeenCalledOnce();
  });

  it('shows export errors in empty state as well', () => {
    const errors = [{ path: 'file.md', error: 'Write failed' }];

    render(
      <ArtifactsPanel
        artifacts={[]}
        exportErrors={errors}
        onVersionSelect={vi.fn()}
        onRetryExport={vi.fn()}
      />
    );

    // Should show both error banner and empty state
    expect(screen.getByTestId('export-errors')).toBeInTheDocument();
    expect(screen.getByTestId('artifacts-empty-state')).toBeInTheDocument();
  });

  it('does not render error banner when exportErrors is empty', () => {
    render(
      <ArtifactsPanel
        artifacts={[makeArtifact()]}
        exportErrors={[]}
        onVersionSelect={vi.fn()}
      />
    );

    expect(screen.queryByTestId('export-errors')).not.toBeInTheDocument();
  });

  it('uses the error-container background for the error banner', () => {
    render(
      <ArtifactsPanel
        artifacts={[makeArtifact()]}
        exportErrors={[{ path: 'x.md', error: 'err' }]}
        onVersionSelect={vi.fn()}
        onRetryExport={vi.fn()}
      />
    );

    const errorBanner = screen.getByTestId('export-errors');
    expect(errorBanner.className).toContain('bg-error-container');
  });

  it('has accessible role="alert" on error banner', () => {
    render(
      <ArtifactsPanel
        artifacts={[makeArtifact()]}
        exportErrors={[{ path: 'x.md', error: 'err' }]}
        onVersionSelect={vi.fn()}
        onRetryExport={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
