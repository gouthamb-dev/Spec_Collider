import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Session } from '../../src/types/domain.ts';
import {
  SessionManager,
  InMemoryStorageBackend,
  createAutoPersist,
  createEmptySession,
  generateSessionId,
  type ISessionManager,
} from '../../src/integration/persistence.ts';

// === Test Fixtures ===

function createTestSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-session-001',
    createdAt: 1000,
    updatedAt: 1000,
    specDraft: {
      overview: 'Test overview',
      proposedArchitecture: 'Test architecture',
      dataModel: 'Test data model',
      apiSurface: 'Test API surface',
      assumptions: 'Test assumptions',
      lastModified: 1000,
      version: 1,
    },
    activityFeed: [],
    moderationHistory: [],
    artifacts: [],
    mcpConnections: [],
    status: 'active',
    ...overrides,
  };
}

// === Mock Session Manager (for autoPersist tests) ===

function createMockSessionManager(): ISessionManager & {
  savedSessions: Session[];
  saveSessionMock: ReturnType<typeof vi.fn>;
} {
  const savedSessions: Session[] = [];
  const saveSessionMock = vi.fn(async (session: Session) => {
    savedSessions.push(session);
  });

  return {
    savedSessions,
    saveSessionMock,
    createSession: vi.fn(async () => createTestSession()),
    loadSession: vi.fn(async (id: string) => createTestSession({ id })),
    saveSession: saveSessionMock,
    getSessionHistory: vi.fn(async () => []),
  };
}

// === Tests: Helper functions ===

describe('generateSessionId', () => {
  it('generates IDs starting with "session-"', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^session-/);
  });

  it('generates unique IDs on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateSessionId()));
    expect(ids.size).toBe(10);
  });
});

describe('createEmptySession', () => {
  it('creates a session with the provided id', () => {
    const session = createEmptySession('my-id');
    expect(session.id).toBe('my-id');
  });

  it('creates a session with active status', () => {
    const session = createEmptySession('test');
    expect(session.status).toBe('active');
  });

  it('creates a session with empty collections', () => {
    const session = createEmptySession('test');
    expect(session.activityFeed).toEqual([]);
    expect(session.moderationHistory).toEqual([]);
    expect(session.artifacts).toEqual([]);
    expect(session.mcpConnections).toEqual([]);
  });

  it('creates a session with empty SpecDraft sections', () => {
    const session = createEmptySession('test');
    expect(session.specDraft.overview).toBe('');
    expect(session.specDraft.proposedArchitecture).toBe('');
    expect(session.specDraft.dataModel).toBe('');
    expect(session.specDraft.apiSurface).toBe('');
    expect(session.specDraft.assumptions).toBe('');
    expect(session.specDraft.version).toBe(0);
  });

  it('sets createdAt and updatedAt to the current time', () => {
    const before = Date.now();
    const session = createEmptySession('test');
    const after = Date.now();

    expect(session.createdAt).toBeGreaterThanOrEqual(before);
    expect(session.createdAt).toBeLessThanOrEqual(after);
    expect(session.updatedAt).toBeGreaterThanOrEqual(before);
    expect(session.updatedAt).toBeLessThanOrEqual(after);
  });
});

// === Tests: SessionManager with InMemoryStorageBackend ===

describe('SessionManager', () => {
  let storage: InMemoryStorageBackend;
  let manager: SessionManager;

  beforeEach(() => {
    storage = new InMemoryStorageBackend();
    manager = new SessionManager(storage);
  });

  describe('createSession', () => {
    it('creates a new session with a generated ID', async () => {
      const session = await manager.createSession();

      expect(session.id).toMatch(/^session-/);
      expect(session.status).toBe('active');
      expect(session.createdAt).toBeGreaterThan(0);
    });

    it('persists the created session to storage', async () => {
      const session = await manager.createSession();
      const stored = await storage.getSession(session.id);

      expect(stored).toBeDefined();
      expect(stored!.id).toBe(session.id);
    });

    it('creates sessions with unique IDs', async () => {
      const session1 = await manager.createSession();
      const session2 = await manager.createSession();

      expect(session1.id).not.toBe(session2.id);
    });

    it('creates a session with empty collections', async () => {
      const session = await manager.createSession();

      expect(session.activityFeed).toEqual([]);
      expect(session.moderationHistory).toEqual([]);
      expect(session.artifacts).toEqual([]);
      expect(session.mcpConnections).toEqual([]);
    });

    it('records a history entry for the creation save', async () => {
      const session = await manager.createSession();
      const history = await manager.getSessionHistory(session.id);

      expect(history.length).toBe(1);
      expect(history[0].sessionId).toBe(session.id);
    });
  });

  describe('saveSession and loadSession', () => {
    it('saves and loads a session round-trip', async () => {
      const session = createTestSession();
      await manager.saveSession(session);
      const loaded = await manager.loadSession('test-session-001');

      expect(loaded.id).toBe('test-session-001');
      expect(loaded.specDraft.overview).toBe('Test overview');
      expect(loaded.status).toBe('active');
    });

    it('throws when loading a non-existent session', async () => {
      await expect(manager.loadSession('non-existent')).rejects.toThrow(
        'Session not found: non-existent'
      );
    });

    it('saves an updated session overwriting the previous version', async () => {
      const session = createTestSession();
      await manager.saveSession(session);

      const updated = { ...session, status: 'finalized' as const };
      await manager.saveSession(updated);
      const loaded = await manager.loadSession('test-session-001');

      expect(loaded.status).toBe('finalized');
    });

    it('preserves full session state including activityFeed', async () => {
      const session = createTestSession({
        activityFeed: [
          {
            id: 'entry-1',
            type: 'idea_submitted',
            contributor: 'user',
            content: 'My great idea',
            timestamp: 5000,
            metadata: {},
            streamComplete: true,
            mcpGrounded: false,
            partiallyGrounded: false,
            unavailableProviders: [],
          },
        ],
      });

      await manager.saveSession(session);
      const loaded = await manager.loadSession('test-session-001');

      expect(loaded.activityFeed).toHaveLength(1);
      expect(loaded.activityFeed[0].content).toBe('My great idea');
    });

    it('preserves moderationHistory in saved session', async () => {
      const session = createTestSession({
        moderationHistory: [
          {
            id: 'decision-1',
            mitigationId: 'mit-1',
            action: 'accepted',
            specDraftSectionModified: 'overview',
            timestamp: 2000,
          },
        ],
      });

      await manager.saveSession(session);
      const loaded = await manager.loadSession('test-session-001');

      expect(loaded.moderationHistory).toHaveLength(1);
      expect(loaded.moderationHistory[0].action).toBe('accepted');
    });

    it('preserves artifacts in saved session', async () => {
      const session = createTestSession({
        artifacts: [
          {
            artifactId: 'art-1',
            type: 'requirements',
            versions: [{ version: 1, content: 'v1 content', generatedAt: 1000 }],
            currentVersion: 1,
          },
        ],
      });

      await manager.saveSession(session);
      const loaded = await manager.loadSession('test-session-001');

      expect(loaded.artifacts).toHaveLength(1);
      expect(loaded.artifacts[0].artifactId).toBe('art-1');
    });

    it('preserves mcpConnections in saved session', async () => {
      const session = createTestSession({
        mcpConnections: [
          { connectionId: 'conn-1', providerName: 'github', status: 'connected' },
        ],
      });

      await manager.saveSession(session);
      const loaded = await manager.loadSession('test-session-001');

      expect(loaded.mcpConnections).toHaveLength(1);
      expect(loaded.mcpConnections[0].providerName).toBe('github');
    });

    it('updates the updatedAt timestamp on save', async () => {
      const session = createTestSession({ updatedAt: 1000 });
      await manager.saveSession(session);
      const loaded = await manager.loadSession('test-session-001');

      expect(loaded.updatedAt).toBeGreaterThan(1000);
    });
  });

  describe('getSessionHistory', () => {
    it('returns empty array for a session with no saves', async () => {
      const history = await manager.getSessionHistory('non-existent');
      expect(history).toEqual([]);
    });

    it('records a history entry each time saveSession is called', async () => {
      const session = createTestSession();
      await manager.saveSession(session);
      await manager.saveSession({ ...session, specDraft: { ...session.specDraft, overview: 'Updated' } });

      const history = await manager.getSessionHistory('test-session-001');
      expect(history).toHaveLength(2);
    });

    it('history entries contain the correct sessionId', async () => {
      await manager.saveSession(createTestSession({ id: 'session-alpha' }));
      const history = await manager.getSessionHistory('session-alpha');

      for (const entry of history) {
        expect(entry.sessionId).toBe('session-alpha');
      }
    });

    it('history entries are sorted by savedAt ascending', async () => {
      const session = createTestSession();
      await manager.saveSession(session);
      await manager.saveSession(session);
      await manager.saveSession(session);

      const history = await manager.getSessionHistory('test-session-001');
      for (let i = 1; i < history.length; i++) {
        expect(history[i].savedAt).toBeGreaterThanOrEqual(history[i - 1].savedAt);
      }
    });

    it('does not return history for other sessions', async () => {
      await manager.saveSession(createTestSession({ id: 'session-a' }));
      await manager.saveSession(createTestSession({ id: 'session-b' }));

      const historyA = await manager.getSessionHistory('session-a');
      const historyB = await manager.getSessionHistory('session-b');

      expect(historyA.every((e) => e.sessionId === 'session-a')).toBe(true);
      expect(historyB.every((e) => e.sessionId === 'session-b')).toBe(true);
    });
  });
});

// === Tests: createAutoPersist ===

describe('createAutoPersist', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not save immediately when persist is called', () => {
    const mockManager = createMockSessionManager();
    const { persist } = createAutoPersist(mockManager, 2000);
    const session = createTestSession();

    persist(session);

    expect(mockManager.saveSessionMock).not.toHaveBeenCalled();
  });

  it('saves the session after the debounce delay', async () => {
    const mockManager = createMockSessionManager();
    const { persist } = createAutoPersist(mockManager, 2000);
    const session = createTestSession();

    persist(session);
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockManager.saveSessionMock).toHaveBeenCalledTimes(1);
    expect(mockManager.savedSessions[0].id).toBe('test-session-001');
  });

  it('resets the debounce timer on subsequent calls', async () => {
    const mockManager = createMockSessionManager();
    const { persist } = createAutoPersist(mockManager, 2000);

    persist(createTestSession({ id: 'first' }));
    await vi.advanceTimersByTimeAsync(1500);

    // Call again before the first debounce fires
    persist(createTestSession({ id: 'second' }));
    await vi.advanceTimersByTimeAsync(1500);

    // At 3000ms total, the first call at 1500ms hasn't fired yet (was reset)
    expect(mockManager.saveSessionMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    // Only the second session is saved
    expect(mockManager.saveSessionMock).toHaveBeenCalledTimes(1);
    expect(mockManager.savedSessions[0].id).toBe('second');
  });

  it('saves within 2 seconds (default delay) of the last state change', async () => {
    const mockManager = createMockSessionManager();
    const { persist } = createAutoPersist(mockManager); // default 2000ms
    const session = createTestSession();

    persist(session);
    await vi.advanceTimersByTimeAsync(1999);
    expect(mockManager.saveSessionMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mockManager.saveSessionMock).toHaveBeenCalledTimes(1);
  });

  it('flush saves immediately and clears pending', async () => {
    const mockManager = createMockSessionManager();
    const { persist, flush } = createAutoPersist(mockManager, 2000);
    const session = createTestSession();

    persist(session);
    await flush();

    expect(mockManager.saveSessionMock).toHaveBeenCalledTimes(1);

    // No additional save after timer expires
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockManager.saveSessionMock).toHaveBeenCalledTimes(1);
  });

  it('cancel prevents pending save from executing', async () => {
    const mockManager = createMockSessionManager();
    const { persist, cancel } = createAutoPersist(mockManager, 2000);
    const session = createTestSession();

    persist(session);
    cancel();

    await vi.advanceTimersByTimeAsync(3000);

    expect(mockManager.saveSessionMock).not.toHaveBeenCalled();
  });

  it('only saves the most recent session when called multiple times', async () => {
    const mockManager = createMockSessionManager();
    const { persist } = createAutoPersist(mockManager, 2000);

    persist(createTestSession({ id: 'v1' }));
    persist(createTestSession({ id: 'v2' }));
    persist(createTestSession({ id: 'v3' }));

    await vi.advanceTimersByTimeAsync(2000);

    expect(mockManager.saveSessionMock).toHaveBeenCalledTimes(1);
    expect(mockManager.savedSessions[0].id).toBe('v3');
  });

  it('supports custom delay values', async () => {
    const mockManager = createMockSessionManager();
    const { persist } = createAutoPersist(mockManager, 500);
    const session = createTestSession();

    persist(session);
    await vi.advanceTimersByTimeAsync(500);

    expect(mockManager.saveSessionMock).toHaveBeenCalledTimes(1);
  });

  it('can be called again after flush completes', async () => {
    const mockManager = createMockSessionManager();
    const { persist, flush } = createAutoPersist(mockManager, 2000);

    persist(createTestSession({ id: 'first-save' }));
    await flush();

    persist(createTestSession({ id: 'second-save' }));
    await flush();

    expect(mockManager.saveSessionMock).toHaveBeenCalledTimes(2);
    expect(mockManager.savedSessions[0].id).toBe('first-save');
    expect(mockManager.savedSessions[1].id).toBe('second-save');
  });

  it('does nothing when flush is called with no pending session', async () => {
    const mockManager = createMockSessionManager();
    const { flush } = createAutoPersist(mockManager, 2000);

    await flush();

    expect(mockManager.saveSessionMock).not.toHaveBeenCalled();
  });
});
