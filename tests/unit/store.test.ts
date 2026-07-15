import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createWorkspaceStore,
  workspaceEventBus,
  subscribeToEvents,
  subscribeToEventType,
} from '../../src/core/store.ts';
import { useActivityFeedStore } from '../../src/core/activity-feed.ts';
import { InMemoryStorageBackend, SessionManager } from '../../src/integration/persistence.ts';
import type { WorkspaceEvent } from '../../src/types/events.ts';
import type { Risk, Mitigation, ModerationDecision } from '../../src/types/domain.ts';

describe('Workspace Store', () => {
  beforeEach(() => {
    workspaceEventBus.clear();
    useActivityFeedStore.getState().clearEntries();
  });

  describe('Event Dispatch', () => {
    it('dispatches idea_submitted and updates session activityFeed', () => {
      const store = createWorkspaceStore();
      store.getState().submitIdea('Build a new authentication system');

      const state = store.getState();
      expect(state.session.activityFeed).toHaveLength(1);
      expect(state.session.activityFeed[0].type).toBe('idea_submitted');
      expect(state.session.activityFeed[0].contributor).toBe('user');
      expect(state.session.activityFeed[0].content).toBe('Build a new authentication system');
    });

    it('dispatches risk_identified and adds entry to activityFeed', () => {
      const store = createWorkspaceStore();
      const risk: Risk = {
        id: 'risk-1',
        title: 'SQL Injection vulnerability',
        category: 'security',
        severity: 'critical',
        description: 'User input is not sanitized',
        affectedComponents: ['auth-service'],
        evidence: 'No parameterized queries',
        isChaosRound: false,
        createdAt: Date.now(),
      };

      store.getState().addRisk(risk);

      const state = store.getState();
      expect(state.session.activityFeed).toHaveLength(1);
      expect(state.session.activityFeed[0].type).toBe('risk_identified');
      expect(state.session.activityFeed[0].contributor).toBe('red_team_agent');
    });

    it('dispatches mitigation_proposed and adds entry to activityFeed', () => {
      const store = createWorkspaceStore();
      const mitigation: Mitigation = {
        id: 'mit-1',
        riskId: 'risk-1',
        riskTitle: 'SQL Injection vulnerability',
        responseType: 'fix',
        description: 'Use parameterized queries throughout',
        technologies: ['prepared-statements', 'orm'],
        tradeOffs: [],
        createdAt: Date.now(),
      };

      store.getState().addMitigation(mitigation);

      const state = store.getState();
      expect(state.session.activityFeed).toHaveLength(1);
      expect(state.session.activityFeed[0].type).toBe('mitigation_proposed');
      expect(state.session.activityFeed[0].contributor).toBe('architect_agent');
    });

    it('dispatches decision_made and records in moderationHistory', () => {
      const store = createWorkspaceStore();
      const decision: ModerationDecision = {
        id: 'dec-1',
        mitigationId: 'mit-1',
        action: 'accepted',
        specDraftSectionModified: 'proposedArchitecture',
        timestamp: Date.now(),
      };

      store.getState().makeDecision(decision);

      const state = store.getState();
      expect(state.session.activityFeed).toHaveLength(1);
      expect(state.session.activityFeed[0].type).toBe('decision_made');
      expect(state.session.moderationHistory).toHaveLength(1);
      expect(state.session.moderationHistory[0]).toEqual(decision);
    });

    it('dispatches chaos_triggered and adds entry', () => {
      const store = createWorkspaceStore();
      store.getState().triggerChaos();

      const state = store.getState();
      expect(state.session.activityFeed).toHaveLength(1);
      expect(state.session.activityFeed[0].type).toBe('chaos_triggered');
    });

    it('records all events in eventHistory', () => {
      const store = createWorkspaceStore();
      store.getState().submitIdea('test idea for history');
      store.getState().triggerChaos();

      const state = store.getState();
      expect(state.eventHistory).toHaveLength(2);
      expect(state.eventHistory[0].type).toBe('idea_submitted');
      expect(state.eventHistory[1].type).toBe('chaos_triggered');
    });
  });

  describe('Activity Feed Sync', () => {
    it('syncs new entries to the standalone activity feed store', () => {
      const store = createWorkspaceStore();
      useActivityFeedStore.getState().clearEntries();

      store.getState().submitIdea('Sync test idea');

      const feedEntries = useActivityFeedStore.getState().entries;
      expect(feedEntries).toHaveLength(1);
      expect(feedEntries[0].type).toBe('idea_submitted');
      expect(feedEntries[0].content).toBe('Sync test idea');
    });

    it('syncs multiple entries to activity feed store', () => {
      const store = createWorkspaceStore();
      useActivityFeedStore.getState().clearEntries();

      store.getState().submitIdea('First idea');
      store.getState().triggerChaos();

      const feedEntries = useActivityFeedStore.getState().entries;
      expect(feedEntries).toHaveLength(2);
    });

    it('syncs activity feed on loadSession', () => {
      const store = createWorkspaceStore();
      useActivityFeedStore.getState().clearEntries();

      const session = store.getState().session;
      const sessionWithEntries = {
        ...session,
        activityFeed: [
          {
            id: 'entry-loaded-1',
            type: 'idea_submitted' as const,
            contributor: 'user' as const,
            content: 'Loaded idea',
            timestamp: Date.now(),
            metadata: {},
            streamComplete: true,
            mcpGrounded: false,
            partiallyGrounded: false,
            unavailableProviders: [],
          },
        ],
      };

      store.getState().loadSession(sessionWithEntries);

      const feedEntries = useActivityFeedStore.getState().entries;
      expect(feedEntries).toHaveLength(1);
      expect(feedEntries[0].content).toBe('Loaded idea');
    });

    it('clears activity feed on resetSession', () => {
      const store = createWorkspaceStore();
      store.getState().submitIdea('Before reset');
      expect(useActivityFeedStore.getState().entries.length).toBeGreaterThan(0);

      store.getState().resetSession();
      expect(useActivityFeedStore.getState().entries).toHaveLength(0);
    });
  });

  describe('Event Bus Subscription', () => {
    it('notifies global subscribers on event dispatch', () => {
      const store = createWorkspaceStore();
      const received: WorkspaceEvent[] = [];

      subscribeToEvents((event) => {
        received.push(event);
      });

      store.getState().submitIdea('Event bus test');

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('idea_submitted');
    });

    it('notifies type-specific subscribers only for matching events', () => {
      const store = createWorkspaceStore();
      const received: WorkspaceEvent[] = [];

      subscribeToEventType('chaos_triggered', (event) => {
        received.push(event);
      });

      store.getState().submitIdea('Should not trigger');
      expect(received).toHaveLength(0);

      store.getState().triggerChaos();
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('chaos_triggered');
    });

    it('supports unsubscribe', () => {
      const store = createWorkspaceStore();
      const received: WorkspaceEvent[] = [];

      const unsub = subscribeToEvents((event) => {
        received.push(event);
      });

      store.getState().submitIdea('Before unsub');
      expect(received).toHaveLength(1);

      unsub();
      store.getState().submitIdea('After unsub');
      expect(received).toHaveLength(1); // Still 1 — not notified
    });

    it('swallows listener errors without breaking dispatch', () => {
      const store = createWorkspaceStore();
      const received: WorkspaceEvent[] = [];

      subscribeToEvents(() => {
        throw new Error('Listener error');
      });

      subscribeToEvents((event) => {
        received.push(event);
      });

      // Should not throw, and second listener still gets called
      store.getState().submitIdea('Error resilience test');
      expect(received).toHaveLength(1);
    });
  });

  describe('Auto-Persistence Wiring', () => {
    it('auto-persists session changes when sessionManager is provided', async () => {
      vi.useFakeTimers();
      try {
        const backend = new InMemoryStorageBackend();
        const sessionManager = new SessionManager(backend);
        const store = createWorkspaceStore(sessionManager);

        store.getState().submitIdea('Persistence wiring test');

        // Auto-persist debounces at 2 seconds — advance timers
        await vi.advanceTimersByTimeAsync(2500);

        // Allow any remaining microtasks (async save) to settle
        await vi.advanceTimersByTimeAsync(0);

        const sessions = backend.getAllSessions();
        expect(sessions.length).toBeGreaterThan(0);
        expect(sessions[0].activityFeed).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Session Management', () => {
    it('resets to a fresh session with new ID', () => {
      const store = createWorkspaceStore();
      const originalId = store.getState().session.id;

      store.getState().submitIdea('Will be cleared');
      store.getState().resetSession();

      const state = store.getState();
      expect(state.session.id).not.toBe(originalId);
      expect(state.session.activityFeed).toHaveLength(0);
      expect(state.eventHistory).toHaveLength(0);
      expect(state.error).toBeNull();
      expect(state.isGenerating).toBe(false);
    });

    it('sets and clears errors', () => {
      const store = createWorkspaceStore();

      store.getState().setError('Something went wrong');
      expect(store.getState().error).toBe('Something went wrong');

      store.getState().clearError();
      expect(store.getState().error).toBeNull();
    });

    it('sets generating state', () => {
      const store = createWorkspaceStore();

      store.getState().setGenerating(true);
      expect(store.getState().isGenerating).toBe(true);

      store.getState().setGenerating(false);
      expect(store.getState().isGenerating).toBe(false);
    });
  });

  describe('Artifact Generation', () => {
    it('adds a new artifact to session', () => {
      const store = createWorkspaceStore();

      store.getState().generateArtifact({
        id: 'art-1',
        type: 'requirements',
        content: '# Requirements\n\n1. Feature A',
        generatedAt: Date.now(),
      });

      const state = store.getState();
      expect(state.session.artifacts).toHaveLength(1);
      expect(state.session.artifacts[0].type).toBe('requirements');
      expect(state.session.artifacts[0].currentVersion).toBe(1);
    });

    it('versions existing artifacts and caps at 50', () => {
      const store = createWorkspaceStore();

      // Add 51 versions of the same artifact type
      for (let i = 0; i < 51; i++) {
        store.getState().generateArtifact({
          id: `art-${i}`,
          type: 'design',
          content: `Design version ${i}`,
          generatedAt: Date.now() + i,
        });
      }

      const state = store.getState();
      expect(state.session.artifacts).toHaveLength(1);
      expect(state.session.artifacts[0].versions.length).toBeLessThanOrEqual(50);
      expect(state.session.artifacts[0].currentVersion).toBe(51);
    });
  });

  describe('MCP Status', () => {
    it('adds a new MCP connection to session', () => {
      const store = createWorkspaceStore();

      store.getState().updateMCPStatus('provider-1', 'connected');

      const state = store.getState();
      expect(state.session.mcpConnections).toHaveLength(1);
      expect(state.session.mcpConnections[0].connectionId).toBe('provider-1');
      expect(state.session.mcpConnections[0].status).toBe('connected');
      expect(state.connectionStatus).toBe('connected');
    });

    it('updates existing MCP connection status', () => {
      const store = createWorkspaceStore();

      store.getState().updateMCPStatus('provider-1', 'connected');
      store.getState().updateMCPStatus('provider-1', 'disconnected');

      const state = store.getState();
      expect(state.session.mcpConnections).toHaveLength(1);
      expect(state.session.mcpConnections[0].status).toBe('disconnected');
    });
  });
});
