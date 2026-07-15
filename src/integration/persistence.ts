import type { Session } from '../types/domain.ts';

/**
 * Represents a saved session version in history.
 */
export interface SessionVersion {
  sessionId: string;
  savedAt: number;
  version: number;
}

/**
 * ISessionManager interface for session persistence operations.
 */
export interface ISessionManager {
  createSession(): Promise<Session>;
  loadSession(sessionId: string): Promise<Session>;
  saveSession(session: Session): Promise<void>;
  getSessionHistory(sessionId: string): Promise<SessionVersion[]>;
}

/**
 * Storage backend interface for decoupling persistence logic from IndexedDB.
 * This enables testing without a real or fake IndexedDB environment.
 */
export interface IStorageBackend {
  getSession(id: string): Promise<Session | undefined>;
  putSession(session: Session): Promise<void>;
  getHistoryEntries(sessionId: string): Promise<SessionVersion[]>;
  putHistoryEntry(entry: SessionVersion): Promise<void>;
}

// === IndexedDB Constants ===

const DB_NAME = 'spec-collider-db';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';
const HISTORY_STORE = 'session-history';

// === IndexedDB Helpers ===

/**
 * Opens (or creates) the IndexedDB database.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const historyStore = db.createObjectStore(HISTORY_STORE, { keyPath: ['sessionId', 'version'] });
        historyStore.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Failed to open database: ${request.error?.message}`));
  });
}

/**
 * Generates a unique session ID.
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Creates an empty session with default values.
 */
export function createEmptySession(id: string): Session {
  const now = Date.now();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    specDraft: {
      overview: '',
      proposedArchitecture: '',
      dataModel: '',
      apiSurface: '',
      assumptions: '',
      lastModified: now,
      version: 0,
    },
    activityFeed: [],
    moderationHistory: [],
    artifacts: [],
    mcpConnections: [],
    status: 'active',
  };
}

// === IndexedDB Storage Backend ===

/**
 * IndexedDB-backed storage backend.
 * Manages the raw read/write operations to IndexedDB.
 */
export class IndexedDBStorageBackend implements IStorageBackend {
  private db: IDBDatabase | null = null;

  private async getDb(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = await openDatabase();
    }
    return this.db;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const store = tx.objectStore(SESSIONS_STORE);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result as Session | undefined);
      request.onerror = () => reject(new Error(`Failed to get session: ${request.error?.message}`));
    });
  }

  async putSession(session: Session): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      store.put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to put session: ${tx.error?.message}`));
    });
  }

  async getHistoryEntries(sessionId: string): Promise<SessionVersion[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readonly');
      const store = tx.objectStore(HISTORY_STORE);
      const index = store.index('sessionId');
      const request = index.getAll(sessionId);
      request.onsuccess = () => resolve(request.result as SessionVersion[]);
      request.onerror = () => reject(new Error(`Failed to get history: ${request.error?.message}`));
    });
  }

  async putHistoryEntry(entry: SessionVersion): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const store = tx.objectStore(HISTORY_STORE);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to put history entry: ${tx.error?.message}`));
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// === In-Memory Storage Backend (for testing) ===

/**
 * In-memory storage backend. Fully synchronous under the hood,
 * but exposes async interface for compatibility.
 */
export class InMemoryStorageBackend implements IStorageBackend {
  private sessions = new Map<string, Session>();
  private history: SessionVersion[] = [];

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async putSession(session: Session): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async getHistoryEntries(sessionId: string): Promise<SessionVersion[]> {
    return this.history.filter((e) => e.sessionId === sessionId);
  }

  async putHistoryEntry(entry: SessionVersion): Promise<void> {
    this.history.push({ ...entry });
  }

  /** Test helper: get all stored sessions */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /** Test helper: get all history entries */
  getAllHistory(): SessionVersion[] {
    return [...this.history];
  }
}

// === Session Manager (uses pluggable storage backend) ===

/**
 * Session manager implementation that delegates storage to an IStorageBackend.
 * In production, use IndexedDBStorageBackend.
 * In tests, use InMemoryStorageBackend.
 */
export class SessionManager implements ISessionManager {
  private storage: IStorageBackend;

  constructor(storage: IStorageBackend) {
    this.storage = storage;
  }

  /**
   * Creates a new empty session and persists it.
   */
  async createSession(): Promise<Session> {
    const id = generateSessionId();
    const session = createEmptySession(id);
    await this.saveSession(session);
    return session;
  }

  /**
   * Loads a session by ID.
   * Throws if the session is not found.
   */
  async loadSession(sessionId: string): Promise<Session> {
    const session = await this.storage.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * Saves (creates or updates) a session and records a history entry.
   */
  async saveSession(session: Session): Promise<void> {
    const updatedSession: Session = {
      ...session,
      updatedAt: Date.now(),
    };

    await this.storage.putSession(updatedSession);

    const historyEntry: SessionVersion = {
      sessionId: session.id,
      savedAt: Date.now(),
      version: Date.now(),
    };
    await this.storage.putHistoryEntry(historyEntry);
  }

  /**
   * Returns the save history for a session, ordered by savedAt ascending.
   */
  async getSessionHistory(sessionId: string): Promise<SessionVersion[]> {
    const entries = await this.storage.getHistoryEntries(sessionId);
    return entries.sort((a, b) => a.savedAt - b.savedAt);
  }
}

// === Convenience factory for production use ===

/**
 * Creates an IndexedDB-backed session manager for production use.
 */
export function createIndexedDBSessionManager(): SessionManager {
  return new SessionManager(new IndexedDBStorageBackend());
}

// === Save Retry Utility ===

/**
 * Notification callback type for save failure events.
 */
export type SaveErrorNotification = {
  type: 'retry' | 'exhausted';
  attempt: number;
  maxAttempts: number;
  error: Error;
};

/**
 * Configuration for save retry behavior.
 */
export interface SaveRetryConfig {
  maxRetries: number;        // Maximum number of retry attempts (default: 3)
  retryDelayMs: number;      // Delay between retries in ms (default: 5000)
  onNotification?: (notification: SaveErrorNotification) => void;
  delayFn?: (ms: number) => Promise<void>;  // Injectable delay for testing
}

/**
 * Result from a save-with-retry operation.
 */
export interface SaveRetryResult {
  success: boolean;
  attempts: number;           // Total attempts made (1 = initial, 2-4 = retries)
  lastError?: Error;
  notificationTriggered: boolean;  // True if persistent notification was triggered
}

/**
 * Creates a save function that wraps saveSession with retry behavior.
 * 
 * - On save failure, retries up to `maxRetries` times (default 3).
 * - After all retries are exhausted, triggers a persistent error notification.
 * - No further automatic retries occur after exhaustion.
 * 
 * Validates: Requirements 7.4, 7.5
 *
 * @param saveFn - The underlying save function to wrap
 * @param config - Retry configuration
 * @returns An async function that performs the save with retry logic
 */
export function createSaveWithRetry(
  saveFn: (session: Session) => Promise<void>,
  config: SaveRetryConfig = { maxRetries: 3, retryDelayMs: 5000 }
): (session: Session) => Promise<SaveRetryResult> {
  const { maxRetries, retryDelayMs, onNotification, delayFn } = config;
  const delay = delayFn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return async (session: Session): Promise<SaveRetryResult> => {
    let lastError: Error | undefined;
    const totalAttempts = 1 + maxRetries; // Initial + retries

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        await saveFn(session);
        return {
          success: true,
          attempts: attempt,
          notificationTriggered: false,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < totalAttempts) {
          // Notify about retry
          onNotification?.({
            type: 'retry',
            attempt,
            maxAttempts: maxRetries,
            error: lastError,
          });

          // Wait before next retry
          await delay(retryDelayMs);
        }
      }
    }

    // All retries exhausted — trigger persistent notification
    onNotification?.({
      type: 'exhausted',
      attempt: totalAttempts,
      maxAttempts: maxRetries,
      error: lastError!,
    });

    return {
      success: false,
      attempts: totalAttempts,
      lastError,
      notificationTriggered: true,
    };
  };
}

// === Auto-Persist Utility ===

/**
 * Creates a debounced auto-persist function that saves the session
 * within 2 seconds of being called. Subsequent calls within the
 * debounce window reset the timer.
 *
 * @param manager - The session manager to use for persistence
 * @param delayMs - Debounce delay in milliseconds (default: 2000ms per Req 7.1)
 * @returns A function that accepts a Session and debounces the save
 */
export function createAutoPersist(
  manager: ISessionManager,
  delayMs: number = 2000
): {
  persist: (session: Session) => void;
  flush: () => Promise<void>;
  cancel: () => void;
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingSession: Session | null = null;
  let flushPromise: Promise<void> | null = null;

  const persist = (session: Session): void => {
    pendingSession = session;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(async () => {
      timeoutId = null;
      if (pendingSession) {
        const sessionToSave = pendingSession;
        pendingSession = null;
        flushPromise = manager.saveSession(sessionToSave);
        await flushPromise;
        flushPromise = null;
      }
    }, delayMs);
  };

  const flush = async (): Promise<void> => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (pendingSession) {
      const sessionToSave = pendingSession;
      pendingSession = null;
      await manager.saveSession(sessionToSave);
    }
    if (flushPromise) {
      await flushPromise;
    }
  };

  const cancel = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    pendingSession = null;
  };

  return { persist, flush, cancel };
}
