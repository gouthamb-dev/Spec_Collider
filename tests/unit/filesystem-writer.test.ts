import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getArtifactPath, exportToFilesystem } from '../../src/integration/filesystem-writer.ts';
import type { FsOps } from '../../src/integration/filesystem-writer.ts';
import type { Artifact } from '../../src/types/domain.ts';

// === Test Fixtures ===

function createTestArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'artifact-001',
    type: 'requirements',
    content: '# Requirements\n\nSome content here.',
    generatedAt: Date.now(),
    ...overrides,
  };
}

function createMockFsOps(): FsOps & {
  mkdir: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
} {
  return {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
}

const BASE_PATH = '/project/root';

// === Tests ===

describe('getArtifactPath', () => {
  it('routes steering_rules to .kiro/steering/steering-rules.md', () => {
    const artifact = createTestArtifact({ type: 'steering_rules' });
    const path = getArtifactPath(artifact, BASE_PATH);

    expect(path).toBe('/project/root/.kiro/steering/steering-rules.md');
  });

  it('routes requirements to .kiro/specs/requirements.md', () => {
    const artifact = createTestArtifact({ type: 'requirements' });
    const path = getArtifactPath(artifact, BASE_PATH);

    expect(path).toBe('/project/root/.kiro/specs/requirements.md');
  });

  it('routes design to .kiro/specs/design.md', () => {
    const artifact = createTestArtifact({ type: 'design' });
    const path = getArtifactPath(artifact, BASE_PATH);

    expect(path).toBe('/project/root/.kiro/specs/design.md');
  });

  it('routes tasks to .kiro/specs/tasks.md', () => {
    const artifact = createTestArtifact({ type: 'tasks' });
    const path = getArtifactPath(artifact, BASE_PATH);

    expect(path).toBe('/project/root/.kiro/specs/tasks.md');
  });

  it('routes adr to .kiro/specs/adr.md', () => {
    const artifact = createTestArtifact({ type: 'adr' });
    const path = getArtifactPath(artifact, BASE_PATH);

    expect(path).toBe('/project/root/.kiro/specs/adr.md');
  });

  it('uses the provided basePath as root', () => {
    const artifact = createTestArtifact({ type: 'design' });
    const path = getArtifactPath(artifact, '/custom/path');

    expect(path).toBe('/custom/path/.kiro/specs/design.md');
  });
});

describe('exportToFilesystem', () => {
  let mockFs: ReturnType<typeof createMockFsOps>;

  beforeEach(() => {
    mockFs = createMockFsOps();
  });

  it('returns success=true when all files are written successfully', async () => {
    const artifacts = [
      createTestArtifact({ type: 'requirements' }),
      createTestArtifact({ type: 'design' }),
    ];

    const result = await exportToFilesystem(artifacts, BASE_PATH, mockFs);

    expect(result.success).toBe(true);
    expect(result.writtenFiles).toHaveLength(2);
    expect(result.failedFiles).toHaveLength(0);
  });

  it('creates directories before writing files', async () => {
    const artifacts = [createTestArtifact({ type: 'requirements' })];

    await exportToFilesystem(artifacts, BASE_PATH, mockFs);

    expect(mockFs.mkdir).toHaveBeenCalledWith(
      '/project/root/.kiro/specs',
      { recursive: true },
    );
  });

  it('creates .kiro/steering/ directory for steering_rules', async () => {
    const artifacts = [createTestArtifact({ type: 'steering_rules' })];

    await exportToFilesystem(artifacts, BASE_PATH, mockFs);

    expect(mockFs.mkdir).toHaveBeenCalledWith(
      '/project/root/.kiro/steering',
      { recursive: true },
    );
  });

  it('writes artifact content to the correct file path', async () => {
    const artifact = createTestArtifact({
      type: 'design',
      content: '# Design Doc\n\nArchitecture details.',
    });

    await exportToFilesystem([artifact], BASE_PATH, mockFs);

    expect(mockFs.writeFile).toHaveBeenCalledWith(
      '/project/root/.kiro/specs/design.md',
      '# Design Doc\n\nArchitecture details.',
      'utf-8',
    );
  });

  it('returns writtenFiles with the paths of successfully written files', async () => {
    const artifacts = [
      createTestArtifact({ type: 'requirements' }),
      createTestArtifact({ type: 'tasks' }),
      createTestArtifact({ type: 'steering_rules' }),
    ];

    const result = await exportToFilesystem(artifacts, BASE_PATH, mockFs);

    expect(result.writtenFiles).toEqual([
      '/project/root/.kiro/specs/requirements.md',
      '/project/root/.kiro/specs/tasks.md',
      '/project/root/.kiro/steering/steering-rules.md',
    ]);
  });

  it('handles per-file write failure without stopping remaining writes', async () => {
    const artifacts = [
      createTestArtifact({ id: '1', type: 'requirements', content: 'req content' }),
      createTestArtifact({ id: '2', type: 'design', content: 'design content' }),
      createTestArtifact({ id: '3', type: 'tasks', content: 'tasks content' }),
    ];

    // Make the second writeFile call fail
    mockFs.writeFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockResolvedValueOnce(undefined);

    const result = await exportToFilesystem(artifacts, BASE_PATH, mockFs);

    expect(result.success).toBe(false);
    expect(result.writtenFiles).toHaveLength(2);
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0]).toEqual({
      path: '/project/root/.kiro/specs/design.md',
      error: 'Permission denied',
    });
  });

  it('returns success=false when any file fails to write', async () => {
    const artifacts = [createTestArtifact({ type: 'requirements' })];
    mockFs.writeFile.mockRejectedValueOnce(new Error('Disk full'));

    const result = await exportToFilesystem(artifacts, BASE_PATH, mockFs);

    expect(result.success).toBe(false);
    expect(result.writtenFiles).toHaveLength(0);
    expect(result.failedFiles).toHaveLength(1);
  });

  it('handles mkdir failure as a per-file error', async () => {
    const artifacts = [createTestArtifact({ type: 'requirements' })];
    mockFs.mkdir.mockRejectedValueOnce(new Error('EACCES: permission denied'));

    const result = await exportToFilesystem(artifacts, BASE_PATH, mockFs);

    expect(result.success).toBe(false);
    expect(result.failedFiles[0].error).toBe('EACCES: permission denied');
  });

  it('returns success=true with empty arrays for empty artifacts input', async () => {
    const result = await exportToFilesystem([], BASE_PATH, mockFs);

    expect(result.success).toBe(true);
    expect(result.writtenFiles).toHaveLength(0);
    expect(result.failedFiles).toHaveLength(0);
  });

  it('handles non-Error thrown values gracefully', async () => {
    const artifacts = [createTestArtifact({ type: 'requirements' })];
    mockFs.writeFile.mockRejectedValueOnce('string error');

    const result = await exportToFilesystem(artifacts, BASE_PATH, mockFs);

    expect(result.success).toBe(false);
    expect(result.failedFiles[0].error).toBe('string error');
  });

  it('writes all artifact types to their correct locations in a mixed batch', async () => {
    const artifacts = [
      createTestArtifact({ type: 'requirements', content: 'reqs' }),
      createTestArtifact({ type: 'design', content: 'design' }),
      createTestArtifact({ type: 'tasks', content: 'tasks' }),
      createTestArtifact({ type: 'adr', content: 'adr' }),
      createTestArtifact({ type: 'steering_rules', content: 'rules' }),
    ];

    const result = await exportToFilesystem(artifacts, BASE_PATH, mockFs);

    expect(result.success).toBe(true);
    expect(result.writtenFiles).toHaveLength(5);

    // Verify steering_rules went to steering dir
    expect(result.writtenFiles).toContain(
      '/project/root/.kiro/steering/steering-rules.md',
    );
    // Verify others went to specs dir
    expect(result.writtenFiles).toContain(
      '/project/root/.kiro/specs/requirements.md',
    );
    expect(result.writtenFiles).toContain(
      '/project/root/.kiro/specs/design.md',
    );
    expect(result.writtenFiles).toContain(
      '/project/root/.kiro/specs/tasks.md',
    );
    expect(result.writtenFiles).toContain(
      '/project/root/.kiro/specs/adr.md',
    );
  });
});
