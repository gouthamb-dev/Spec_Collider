import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Session, SpecDraft, Risk, Mitigation, ModerationDecision, Artifact, ActivityEntry, VersionedArtifact } from '../types/domain.ts';
import type { ConnectionStatus } from '../types/ui.ts';
import type { WorkspaceEvent } from '../types/events.ts';
import { createAutoPersist, createEmptySession, generateSessionId } from '../integration/persistence.ts';
import type { ISessionManager } from '../integration/persistence.ts';
import { useActivityFeedStore } from './activity-feed.ts';

// === Store State ===

export interface WorkspaceState {
  session: Session;
  connectionStatus: ConnectionStatus;
  isGenerating: boolean;
  error: string | null;
  eventHistory: WorkspaceEvent[];
}

// === Store Actions ===

export interface WorkspaceActions {
  // Event dispatch
  dispatchEvent: (event: WorkspaceEvent) => void;

  // Domain actions
  submitIdea: (text: string) => void;
  updateSpecDraft: (draft: SpecDraft) => void;
  addRisk: (risk: Risk) => void;
  addMitigation: (mitigation: Mitigation) => void;
  makeDecision: (decision: ModerationDecision) => void;
  triggerChaos: () => void;
  generateArtifact: (artifact: Artifact) => void;

  // Connection/status actions
  updateMCPStatus: (connectionId: string, status: ConnectionStatus) => void;
  setError: (error: string) => void;
  clearError: () => void;
  setGenerating: (generating: boolean) => void;

  // Session management
  loadSession: (session: Session) => void;
  resetSession: () => void;
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

// === Event Subscription System ===

export type EventListener = (event: WorkspaceEvent) => void;
export type EventUnsubscribe = () => void;

/**
 * Registry of event listeners for external subscription.
 * Supports subscribing to all events or specific event types.
 */
class EventBus {
  private listeners: Map<string, Set<EventListener>> = new Map();
  private globalListeners: Set<EventListener> = new Set();

  /**
   * Subscribe to all workspace events.
   */
  subscribe(listener: EventListener): EventUnsubscribe {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * Subscribe to a specific event type.
   */
  subscribeToType(eventType: WorkspaceEvent['type'], listener: EventListener): EventUnsubscribe {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Dispatch an event to all matching listeners.
   */
  emit(event: WorkspaceEvent): void {
    // Notify global listeners
    for (const listener of this.globalListeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors to avoid breaking the event chain
      }
    }

    // Notify type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch {
          // Swallow listener errors
        }
      }
    }
  }

  /**
   * Remove all listeners (useful for testing/cleanup).
   */
  clear(): void {
    this.listeners.clear();
    this.globalListeners.clear();
  }
}

/** Shared event bus instance for workspace-level event subscription */
export const workspaceEventBus = new EventBus();

// === Activity Entry Factory ===

function generateEntryId(): string {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function createActivityEntry(
  type: ActivityEntry['type'],
  contributor: ActivityEntry['contributor'],
  content: string,
  metadata: Record<string, unknown> = {}
): ActivityEntry {
  return {
    id: generateEntryId(),
    type,
    contributor,
    content,
    timestamp: Date.now(),
    metadata,
    streamComplete: true,
    mcpGrounded: false,
    partiallyGrounded: false,
    unavailableProviders: [],
  };
}

// === Event Router ===

/**
 * Routes a WorkspaceEvent to the appropriate state mutation.
 * Returns the partial state update to apply.
 */
function routeEvent(
  state: WorkspaceState,
  event: WorkspaceEvent
): Partial<WorkspaceState> {
  const session = state.session;

  switch (event.type) {
    case 'idea_submitted': {
      const entry = createActivityEntry(
        'idea_submitted',
        'user',
        event.payload.text,
        { timestamp: event.payload.timestamp }
      );
      return {
        session: {
          ...session,
          updatedAt: Date.now(),
          activityFeed: [...session.activityFeed, entry],
        },
      };
    }

    case 'spec_draft_generated': {
      return {
        session: {
          ...session,
          updatedAt: Date.now(),
          specDraft: event.payload.draft,
        },
      };
    }

    case 'risk_identified': {
      const entry = createActivityEntry(
        'risk_identified',
        'red_team_agent',
        event.payload.risk.title,
        { riskId: event.payload.risk.id, severity: event.payload.risk.severity, category: event.payload.risk.category }
      );
      return {
        session: {
          ...session,
          updatedAt: Date.now(),
          activityFeed: [...session.activityFeed, entry],
        },
      };
    }

    case 'mitigation_proposed': {
      const entry = createActivityEntry(
        'mitigation_proposed',
        'architect_agent',
        event.payload.mitigation.description,
        { mitigationId: event.payload.mitigation.id, riskId: event.payload.mitigation.riskId }
      );
      return {
        session: {
          ...session,
          updatedAt: Date.now(),
          activityFeed: [...session.activityFeed, entry],
        },
      };
    }

    case 'decision_made': {
      const decision = event.payload.decision;
      const entry = createActivityEntry(
        'decision_made',
        'user',
        `Decision: ${decision.action} on mitigation ${decision.mitigationId}`,
        { action: decision.action, mitigationId: decision.mitigationId }
      );
      return {
        session: {
          ...session,
          updatedAt: Date.now(),
          activityFeed: [...session.activityFeed, entry],
          moderationHistory: [...session.moderationHistory, decision],
        },
      };
    }

    case 'chaos_triggered': {
      const entry = createActivityEntry(
        'chaos_triggered',
        'user',
        'Chaos round triggered',
        { timestamp: event.payload.timestamp }
      );
      return {
        session: {
          ...session,
          updatedAt: Date.now(),
          activityFeed: [...session.activityFeed, entry],
        },
      };
    }

    case 'artifact_generated': {
      const artifact = event.payload.artifact;
      const existingIdx = session.artifacts.findIndex(
        (a) => a.type === artifact.type
      );

      let updatedArtifacts: VersionedArtifact[];

      if (existingIdx >= 0) {
        const existing = session.artifacts[existingIdx];
        const newVersion = existing.currentVersion + 1;
        const updatedVersions = [
          ...existing.versions,
          { version: newVersion, content: artifact.content, generatedAt: artifact.generatedAt },
        ];
        // Cap at 50 versions
        const cappedVersions = updatedVersions.length > 50
          ? updatedVersions.slice(updatedVersions.length - 50)
          : updatedVersions;

        updatedArtifacts = [...session.artifacts];
        updatedArtifacts[existingIdx] = {
          ...existing,
          versions: cappedVersions,
          currentVersion: newVersion,
        };
      } else {
        updatedArtifacts = [
          ...session.artifacts,
          {
            artifactId: artifact.id,
            type: artifact.type,
            versions: [{ version: 1, content: artifact.content, generatedAt: artifact.generatedAt }],
            currentVersion: 1,
          },
        ];
      }

      return {
        session: {
          ...session,
          updatedAt: Date.now(),
          artifacts: updatedArtifacts,
        },
      };
    }

    case 'mcp_status_changed': {
      const { connectionId, status } = event.payload;
      const mcpStatus = status === 'connected' ? 'connected'
        : status === 'disconnected' ? 'disconnected'
        : 'error';

      const existingIdx = session.mcpConnections.findIndex(
        (c) => c.connectionId === connectionId
      );

      let updatedConnections = [...session.mcpConnections];
      if (existingIdx >= 0) {
        updatedConnections[existingIdx] = {
          ...updatedConnections[existingIdx],
          status: mcpStatus,
        };
      } else {
        updatedConnections = [
          ...updatedConnections,
          { connectionId, providerName: connectionId, status: mcpStatus },
        ];
      }

      return {
        session: {
          ...session,
          updatedAt: Date.now(),
          mcpConnections: updatedConnections,
        },
        connectionStatus: status,
      };
    }

    case 'stream_chunk': {
      // Stream chunks don't mutate session state directly - they're handled by UI
      return {};
    }

    case 'error': {
      return {
        error: event.payload.message,
      };
    }
  }
}

// === Store Factory ===

/**
 * Creates the workspace store with optional session manager for auto-persistence.
 * If a sessionManager is provided, state changes will be auto-persisted within 2 seconds.
 */
export function createWorkspaceStore(sessionManager?: ISessionManager) {
  const initialSession = createEmptySession(generateSessionId());

  const store = create<WorkspaceStore>()(
    subscribeWithSelector((set, get) => ({
      // Initial state
      session: initialSession,
      connectionStatus: 'disconnected' as ConnectionStatus,
      isGenerating: false,
      error: null,
      eventHistory: [],

      // Event dispatch — central entry point for all state mutations
      dispatchEvent: (event: WorkspaceEvent) => {
        const state = get();
        const updates = routeEvent(state, event);
        set({
          ...updates,
          eventHistory: [...state.eventHistory, event],
        });

        // Emit to event bus for external subscribers (real-time updates)
        workspaceEventBus.emit(event);

        // Sync activity feed store: if this event produced a new entry,
        // propagate it to the standalone activity feed store within the same tick
        // (satisfies Req 5.3: display within 2 seconds of event)
        if (updates.session && updates.session.activityFeed) {
          const newEntries = updates.session.activityFeed;
          const currentEntries = state.session.activityFeed;
          if (newEntries.length > currentEntries.length) {
            const addedEntries = newEntries.slice(currentEntries.length);
            const feedStore = useActivityFeedStore.getState();
            for (const entry of addedEntries) {
              feedStore.addEntry(entry);
            }
          }
        }
      },

      // Convenience actions that delegate to dispatchEvent
      submitIdea: (text: string) => {
        get().dispatchEvent({
          type: 'idea_submitted',
          payload: { text, timestamp: Date.now() },
        });
      },

      updateSpecDraft: (draft: SpecDraft) => {
        get().dispatchEvent({
          type: 'spec_draft_generated',
          payload: { draft },
        });
      },

      addRisk: (risk: Risk) => {
        get().dispatchEvent({
          type: 'risk_identified',
          payload: { risk, agentRole: 'red_team' },
        });
      },

      addMitigation: (mitigation: Mitigation) => {
        get().dispatchEvent({
          type: 'mitigation_proposed',
          payload: { mitigation, agentRole: 'architect' },
        });
      },

      makeDecision: (decision: ModerationDecision) => {
        get().dispatchEvent({
          type: 'decision_made',
          payload: { decision },
        });
      },

      triggerChaos: () => {
        get().dispatchEvent({
          type: 'chaos_triggered',
          payload: { timestamp: Date.now() },
        });
      },

      generateArtifact: (artifact: Artifact) => {
        get().dispatchEvent({
          type: 'artifact_generated',
          payload: { artifact },
        });
      },

      updateMCPStatus: (connectionId: string, status: ConnectionStatus) => {
        get().dispatchEvent({
          type: 'mcp_status_changed',
          payload: { connectionId, status },
        });
      },

      setError: (error: string) => {
        set({ error });
      },

      clearError: () => {
        set({ error: null });
      },

      setGenerating: (generating: boolean) => {
        set({ isGenerating: generating });
      },

      loadSession: (session: Session) => {
        set({ session, error: null });
        // Sync activity feed store with loaded session
        const feedStore = useActivityFeedStore.getState();
        feedStore.clearEntries();
        for (const entry of session.activityFeed) {
          feedStore.addEntry(entry);
        }
      },

      resetSession: () => {
        set({
          session: createEmptySession(generateSessionId()),
          connectionStatus: 'disconnected',
          isGenerating: false,
          error: null,
          eventHistory: [],
        });
        // Clear activity feed store on reset
        useActivityFeedStore.getState().clearEntries();
        // Clear event bus subscriptions
        workspaceEventBus.clear();
      },
    }))
  );

  // Wire auto-persistence: subscribe to session changes and persist within 2 seconds
  if (sessionManager) {
    const autoPersist = createAutoPersist(sessionManager);

    store.subscribe(
      (state) => state.session,
      (session) => {
        autoPersist.persist(session);
      }
    );
  }

  return store;
}

// === Default Store Instance ===

/**
 * Default workspace store instance without persistence (production code should
 * call createWorkspaceStore with a sessionManager for auto-persistence).
 */
export const useWorkspaceStore = createWorkspaceStore();

// === Convenience Helpers ===

/**
 * Creates a workspace store wired with IndexedDB-backed session persistence.
 * Use this in production initialization (e.g., main.tsx or App root).
 *
 * Satisfies Req 7.1: auto-persist within 2 seconds of state-changing actions.
 */
export function createProductionStore(sessionManager: ISessionManager) {
  return createWorkspaceStore(sessionManager);
}

/**
 * Subscribe to workspace events. Returns an unsubscribe function.
 * Events are emitted synchronously after state updates, so listeners
 * receive notifications within the same tick as the mutation.
 *
 * Satisfies Req 5.3: Activity Feed updates within 2 seconds of events.
 */
export function subscribeToEvents(listener: EventListener): EventUnsubscribe {
  return workspaceEventBus.subscribe(listener);
}

/**
 * Subscribe to a specific workspace event type.
 */
export function subscribeToEventType(
  eventType: WorkspaceEvent['type'],
  listener: EventListener
): EventUnsubscribe {
  return workspaceEventBus.subscribeToType(eventType, listener);
}
