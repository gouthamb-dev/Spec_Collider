import { describe, it, expect } from 'vitest';
import {
  createVersionedArtifact,
  addVersion,
  getVersion,
  getCurrentVersion,
  MAX_VERSIONS,
} from '../../src/core/versioned-artifacts.ts';
import type { Artifact, VersionedArtifact } from '../../src/types/domain.ts';

// === Test Fixtures ===

function createTestArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'artifact-001',
    type: 'requirements',
    content: 'Initial artifact content',
    generatedAt: 1000,
    ...overrides,
  };
}

function createVersionedArtifactWithVersions(count: number): VersionedArtifact {
  const artifact = createTestArtifact();
  let va = createVersionedArtifact(artifact);
  for (let i = 2; i <= count; i++) {
    va = addVersion(va, `Content for version ${i}`, 1000 + i);
  }
  return va;
}

// === Tests ===

describe('createVersionedArtifact', () => {
  it('creates a VersionedArtifact from an Artifact with version 1', () => {
    const artifact = createTestArtifact();
    const va = createVersionedArtifact(artifact);

    expect(va.artifactId).toBe('artifact-001');
    expect(va.type).toBe('requirements');
    expect(va.currentVersion).toBe(1);
    expect(va.versions).toHaveLength(1);
  });

  it('preserves the artifact content in the first version', () => {
    const artifact = createTestArtifact({ content: 'My special content' });
    const va = createVersionedArtifact(artifact);

    expect(va.versions[0].content).toBe('My special content');
    expect(va.versions[0].version).toBe(1);
  });

  it('preserves the generatedAt timestamp from the artifact', () => {
    const artifact = createTestArtifact({ generatedAt: 42000 });
    const va = createVersionedArtifact(artifact);

    expect(va.versions[0].generatedAt).toBe(42000);
  });

  it('maps the artifact type correctly', () => {
    const artifact = createTestArtifact({ type: 'steering_rules' });
    const va = createVersionedArtifact(artifact);

    expect(va.type).toBe('steering_rules');
  });
});

describe('addVersion', () => {
  it('adds a new version with auto-incremented version number', () => {
    const artifact = createTestArtifact();
    const va = createVersionedArtifact(artifact);
    const updated = addVersion(va, 'Version 2 content', 2000);

    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[1].version).toBe(2);
    expect(updated.versions[1].content).toBe('Version 2 content');
    expect(updated.versions[1].generatedAt).toBe(2000);
  });

  it('updates currentVersion to the newly added version', () => {
    const artifact = createTestArtifact();
    const va = createVersionedArtifact(artifact);
    const updated = addVersion(va, 'New content', 2000);

    expect(updated.currentVersion).toBe(2);
  });

  it('does not mutate the original VersionedArtifact', () => {
    const artifact = createTestArtifact();
    const va = createVersionedArtifact(artifact);
    addVersion(va, 'New content', 2000);

    expect(va.versions).toHaveLength(1);
    expect(va.currentVersion).toBe(1);
  });

  it('increments version numbers sequentially across multiple additions', () => {
    const artifact = createTestArtifact();
    let va = createVersionedArtifact(artifact);
    va = addVersion(va, 'v2', 2000);
    va = addVersion(va, 'v3', 3000);
    va = addVersion(va, 'v4', 4000);

    expect(va.versions).toHaveLength(4);
    expect(va.versions.map((v) => v.version)).toEqual([1, 2, 3, 4]);
    expect(va.currentVersion).toBe(4);
  });

  it('preserves the artifact type and id when adding versions', () => {
    const artifact = createTestArtifact({ id: 'art-xyz', type: 'design' });
    let va = createVersionedArtifact(artifact);
    va = addVersion(va, 'Updated design', 2000);

    expect(va.artifactId).toBe('art-xyz');
    expect(va.type).toBe('design');
  });

  describe('50-version cap enforcement', () => {
    it('retains exactly 50 versions when 50 are added', () => {
      const va = createVersionedArtifactWithVersions(50);

      expect(va.versions).toHaveLength(50);
    });

    it('evicts the oldest version when a 51st is added', () => {
      let va = createVersionedArtifactWithVersions(50);
      va = addVersion(va, 'Version 51 content', 9999);

      expect(va.versions).toHaveLength(50);
      // Version 1 (the oldest) should be evicted
      expect(va.versions.find((v) => v.version === 1)).toBeUndefined();
      // Version 51 should exist
      expect(va.versions.find((v) => v.version === 51)).toBeDefined();
    });

    it('always keeps the most recent 50 versions', () => {
      let va = createVersionedArtifactWithVersions(50);
      // Add 10 more versions (51-60)
      for (let i = 51; i <= 60; i++) {
        va = addVersion(va, `Content ${i}`, 1000 + i);
      }

      expect(va.versions).toHaveLength(50);
      // Should have versions 11-60
      const versionNumbers = va.versions.map((v) => v.version).sort((a, b) => a - b);
      expect(versionNumbers[0]).toBe(11);
      expect(versionNumbers[versionNumbers.length - 1]).toBe(60);
    });

    it('sets currentVersion to the newly added version even after eviction', () => {
      let va = createVersionedArtifactWithVersions(50);
      va = addVersion(va, 'After cap', 9999);

      expect(va.currentVersion).toBe(51);
    });

    it('never exceeds MAX_VERSIONS regardless of how many are added', () => {
      let va = createVersionedArtifactWithVersions(50);
      for (let i = 0; i < 100; i++) {
        va = addVersion(va, `Extra ${i}`, 10000 + i);
      }

      expect(va.versions.length).toBeLessThanOrEqual(MAX_VERSIONS);
      expect(va.versions).toHaveLength(50);
    });
  });
});

describe('getVersion', () => {
  it('returns the requested version by version number', () => {
    let va = createVersionedArtifact(createTestArtifact());
    va = addVersion(va, 'Second version', 2000);
    va = addVersion(va, 'Third version', 3000);

    const v2 = getVersion(va, 2);
    expect(v2).not.toBeNull();
    expect(v2!.version).toBe(2);
    expect(v2!.content).toBe('Second version');
    expect(v2!.generatedAt).toBe(2000);
  });

  it('returns null when version number does not exist', () => {
    const va = createVersionedArtifact(createTestArtifact());
    const result = getVersion(va, 99);

    expect(result).toBeNull();
  });

  it('returns null for version 0', () => {
    const va = createVersionedArtifact(createTestArtifact());
    expect(getVersion(va, 0)).toBeNull();
  });

  it('returns null for negative version numbers', () => {
    const va = createVersionedArtifact(createTestArtifact());
    expect(getVersion(va, -1)).toBeNull();
  });

  it('returns the first version correctly', () => {
    const va = createVersionedArtifact(createTestArtifact({ content: 'First content' }));
    const v1 = getVersion(va, 1);

    expect(v1).not.toBeNull();
    expect(v1!.content).toBe('First content');
  });

  it('returns null for evicted versions', () => {
    let va = createVersionedArtifactWithVersions(50);
    va = addVersion(va, 'Version 51', 9999);

    // Version 1 was evicted
    expect(getVersion(va, 1)).toBeNull();
    // Version 51 exists
    expect(getVersion(va, 51)).not.toBeNull();
  });
});

describe('getCurrentVersion', () => {
  it('returns the current version after creation', () => {
    const va = createVersionedArtifact(createTestArtifact({ content: 'Initial' }));
    const current = getCurrentVersion(va);

    expect(current).not.toBeNull();
    expect(current!.version).toBe(1);
    expect(current!.content).toBe('Initial');
  });

  it('returns the latest version after adding new versions', () => {
    let va = createVersionedArtifact(createTestArtifact());
    va = addVersion(va, 'Latest content', 5000);

    const current = getCurrentVersion(va);
    expect(current).not.toBeNull();
    expect(current!.version).toBe(2);
    expect(current!.content).toBe('Latest content');
  });

  it('returns the correct version after many additions', () => {
    let va = createVersionedArtifact(createTestArtifact());
    for (let i = 2; i <= 10; i++) {
      va = addVersion(va, `Content ${i}`, 1000 * i);
    }

    const current = getCurrentVersion(va);
    expect(current).not.toBeNull();
    expect(current!.version).toBe(10);
    expect(current!.content).toBe('Content 10');
  });

  it('returns the current version even after eviction', () => {
    let va = createVersionedArtifactWithVersions(50);
    va = addVersion(va, 'Post-eviction current', 99999);

    const current = getCurrentVersion(va);
    expect(current).not.toBeNull();
    expect(current!.version).toBe(51);
    expect(current!.content).toBe('Post-eviction current');
  });

  it('returns null for an empty versions array', () => {
    const va: VersionedArtifact = {
      artifactId: 'empty',
      type: 'requirements',
      versions: [],
      currentVersion: 1,
    };

    expect(getCurrentVersion(va)).toBeNull();
  });
});
