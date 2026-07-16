import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ArtifactsPanel } from '../../src/components/ArtifactsPanel.tsx';
import type { VersionedArtifact } from '../../src/types/domain.ts';

/**
 * Bug Condition Exploration Tests - ArtifactsPanel Markdown Interpretation Bug
 *
 * These tests confirm that the ArtifactsPanel currently interprets markdown
 * syntax instead of displaying raw content as preformatted text.
 *
 * EXPECTED: These tests FAIL on unfixed code (confirming the bug exists).
 *
 * Validates: Requirements 1.1, 2.1
 */

function makeArtifactWithContent(content: string): VersionedArtifact {
  return {
    artifactId: 'art-test',
    type: 'requirements',
    versions: [{ version: 1, content, generatedAt: 1000 }],
    currentVersion: 1,
  };
}

describe('ArtifactsPanel - Bug Condition Exploration (Markdown Interpretation)', () => {
  it('should preserve raw # character in heading content', () => {
    const artifact = makeArtifactWithContent('# Hello');

    render(<ArtifactsPanel artifacts={[artifact]} onVersionSelect={vi.fn()} />);

    const contentArea = screen.getByTestId('artifact-content-art-test');
    // The raw '#' character should be present in the text content.
    // On unfixed code, react-markdown converts '# Hello' into <h1>Hello</h1>,
    // stripping the '#' from visible text.
    expect(contentArea.textContent).toContain('#');
  });

  it('should preserve raw ** and _ characters in bold/italic content', () => {
    const artifact = makeArtifactWithContent('**bold** and _italic_');

    render(<ArtifactsPanel artifacts={[artifact]} onVersionSelect={vi.fn()} />);

    const contentArea = screen.getByTestId('artifact-content-art-test');
    // The raw '**' and '_' characters should be present in the text content.
    // On unfixed code, react-markdown converts them into <strong> and <em> tags,
    // stripping the syntax characters from visible text.
    expect(contentArea.textContent).toContain('**');
    expect(contentArea.textContent).toContain('_');
  });
});
