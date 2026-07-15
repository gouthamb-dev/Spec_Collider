import type { Artifact, VersionedArtifact, ArtifactVersion } from '../types/domain.ts';

/**
 * Maximum number of versions retained per artifact.
 * When exceeded, the oldest version is evicted.
 */
export const MAX_VERSIONS = 50;

/**
 * Creates a new VersionedArtifact from an initial Artifact.
 * The first version is set to version 1.
 */
export function createVersionedArtifact(artifact: Artifact): VersionedArtifact {
  const initialVersion: ArtifactVersion = {
    version: 1,
    content: artifact.content,
    generatedAt: artifact.generatedAt,
  };

  return {
    artifactId: artifact.id,
    type: artifact.type,
    versions: [initialVersion],
    currentVersion: 1,
  };
}

/**
 * Adds a new version to a VersionedArtifact.
 * Auto-increments the version number based on the highest existing version.
 * Enforces the 50-version cap by evicting the oldest version when exceeded.
 *
 * Returns a new VersionedArtifact (immutable pattern).
 */
export function addVersion(
  versionedArtifact: VersionedArtifact,
  content: string,
  generatedAt: number = Date.now()
): VersionedArtifact {
  const nextVersionNumber =
    versionedArtifact.versions.length > 0
      ? Math.max(...versionedArtifact.versions.map((v) => v.version)) + 1
      : 1;

  const newVersion: ArtifactVersion = {
    version: nextVersionNumber,
    content,
    generatedAt,
  };

  let updatedVersions = [...versionedArtifact.versions, newVersion];

  // Enforce the 50-version cap: evict oldest (lowest version number) when exceeded
  if (updatedVersions.length > MAX_VERSIONS) {
    // Sort by version number ascending and remove the oldest
    updatedVersions.sort((a, b) => a.version - b.version);
    updatedVersions = updatedVersions.slice(updatedVersions.length - MAX_VERSIONS);
  }

  return {
    ...versionedArtifact,
    versions: updatedVersions,
    currentVersion: nextVersionNumber,
  };
}

/**
 * Retrieves a specific version by version number.
 * Returns null if the version number is not found.
 */
export function getVersion(
  versionedArtifact: VersionedArtifact,
  versionNumber: number
): ArtifactVersion | null {
  return versionedArtifact.versions.find((v) => v.version === versionNumber) ?? null;
}

/**
 * Retrieves the current (active) version of a VersionedArtifact.
 * Returns null if the artifact has no versions or the current version is not found.
 */
export function getCurrentVersion(
  versionedArtifact: VersionedArtifact
): ArtifactVersion | null {
  return getVersion(versionedArtifact, versionedArtifact.currentVersion);
}
