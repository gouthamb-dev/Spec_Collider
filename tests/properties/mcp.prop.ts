import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  MCPClientManager,
  MCPConnectionCapError,
  MAX_MCP_CONNECTIONS,
  labelEntryWithUnavailableProviders,
  applyMCPChange,
} from '../../src/integration/mcp-client.ts';
import { arbSession } from '../generators.ts';
import type { MCPProviderConfig } from '../../src/types/mcp.ts';

// === Helper Generators ===

function arbProviderConfig(): fc.Arbitrary<MCPProviderConfig> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    uri: fc.webUrl(),
    capabilities: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
  });
}

function arbProviderConfigs(count: number): fc.Arbitrary<MCPProviderConfig[]> {
  return fc.array(arbProviderConfig(), { minLength: count, maxLength: count }).map((configs) =>
    configs.map((config, i) => ({ ...config, id: `provider-${i}-${config.id}` }))
  );
}

// === Property 23: MCP connection cap ===

describe('Feature: spec-collider, Property 23: MCP connection cap', () => {
  /**
   * Validates: Requirements 9.1
   *
   * For any N simultaneous MCP connection attempts, the system SHALL allow
   * connections if the current active count is below 5 and reject the connection
   * with an appropriate error if allowing it would exceed 5 simultaneous connections.
   */

  it('allows connections when active count is below 5', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_MCP_CONNECTIONS }),
        arbProviderConfigs(MAX_MCP_CONNECTIONS),
        (count, configs) => {
          const manager = new MCPClientManager();

          // Connect exactly `count` providers (1..5)
          for (let i = 0; i < count; i++) {
            const connection = manager.connectSync(configs[i]);
            expect(connection.status).toBe('connected');
            expect(connection.config).toEqual(configs[i]);
          }

          expect(manager.getActiveConnections().length).toBe(count);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects connections that would exceed the cap of 5', () => {
    fc.assert(
      fc.property(
        arbProviderConfigs(MAX_MCP_CONNECTIONS + 1),
        (configs) => {
          const manager = new MCPClientManager();

          // Fill up to the cap
          for (let i = 0; i < MAX_MCP_CONNECTIONS; i++) {
            manager.connectSync(configs[i]);
          }

          expect(manager.getActiveConnections().length).toBe(MAX_MCP_CONNECTIONS);

          // Attempt to exceed the cap must throw
          expect(() => manager.connectSync(configs[MAX_MCP_CONNECTIONS])).toThrow(MCPConnectionCapError);

          // Active count remains at the cap
          expect(manager.getActiveConnections().length).toBe(MAX_MCP_CONNECTIONS);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('allows new connections after disconnecting one at cap', () => {
    fc.assert(
      fc.property(
        arbProviderConfigs(MAX_MCP_CONNECTIONS + 1),
        (configs) => {
          const manager = new MCPClientManager();

          // Fill to cap
          for (let i = 0; i < MAX_MCP_CONNECTIONS; i++) {
            manager.connectSync(configs[i]);
          }

          // Disconnect one
          manager.disconnectSync(configs[0].id);
          expect(manager.getActiveConnections().length).toBe(MAX_MCP_CONNECTIONS - 1);

          // Now a new connection should succeed
          const newConnection = manager.connectSync(configs[MAX_MCP_CONNECTIONS]);
          expect(newConnection.status).toBe('connected');
          expect(manager.getActiveConnections().length).toBe(MAX_MCP_CONNECTIONS);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// === Property 24: Provider unavailability labeling ===

describe('Feature: spec-collider, Property 24: Provider unavailability labeling', () => {
  /**
   * Validates: Requirements 9.4, 9.6
   *
   * For any ActivityEntry produced while one or more Context_Providers are unavailable
   * (failed or dropped mid-analysis), the entry SHALL have its unavailableProviders
   * array populated with the names of the unavailable providers and SHALL be marked
   * as partially grounded.
   */

  it('labels entry with unavailable provider names and marks as partially grounded', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        (providerNames) => {
          const entry = {
            partiallyGrounded: false,
            unavailableProviders: [] as string[],
          };

          labelEntryWithUnavailableProviders(entry, providerNames);

          // Entry must be marked as partially grounded
          expect(entry.partiallyGrounded).toBe(true);

          // All unavailable provider names must be present
          expect(entry.unavailableProviders).toEqual(providerNames);
          expect(entry.unavailableProviders.length).toBe(providerNames.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does not mark entry as partially grounded when no providers are unavailable', () => {
    fc.assert(
      fc.property(
        fc.constant([] as string[]),
        (providerNames) => {
          const entry = {
            partiallyGrounded: false,
            unavailableProviders: [] as string[],
          };

          labelEntryWithUnavailableProviders(entry, providerNames);

          // Entry must NOT be marked as partially grounded when list is empty
          expect(entry.partiallyGrounded).toBe(false);
          expect(entry.unavailableProviders).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('MCPClientManager correctly reports unavailable providers after errors', () => {
    fc.assert(
      fc.property(
        arbProviderConfigs(3),
        fc.integer({ min: 1, max: 3 }),
        (configs, failCount) => {
          const manager = new MCPClientManager();

          // Connect all providers
          for (const config of configs) {
            manager.connectSync(config);
          }

          // Mark some as errored
          const errored = configs.slice(0, failCount);
          for (const config of errored) {
            manager.markError(config.id, 'Connection dropped');
          }

          const unavailable = manager.getUnavailableProviderNames();

          // All errored provider names should be reported
          for (const config of errored) {
            expect(unavailable).toContain(config.name);
          }
          expect(unavailable.length).toBe(failCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// === Property 25: MCP connect/disconnect preserves session state ===

describe('Feature: spec-collider, Property 25: MCP connect/disconnect preserves session state', () => {
  /**
   * Validates: Requirements 9.5
   *
   * For any Session state, connecting or disconnecting a Context_Provider SHALL
   * not modify the existing specDraft, activityFeed entries, or moderationHistory.
   * Only the mcpConnections array SHALL change.
   */

  it('connect does not modify specDraft, activityFeed, or moderationHistory', () => {
    fc.assert(
      fc.property(
        arbSession(),
        arbProviderConfig(),
        (session, providerConfig) => {
          // Snapshot the session state before connection
          const specDraftBefore = JSON.stringify(session.specDraft);
          const activityFeedBefore = JSON.stringify(session.activityFeed);
          const moderationHistoryBefore = JSON.stringify(session.moderationHistory);

          // Simulate a connect by applying MCP change
          const newMcpConnections = [
            ...session.mcpConnections,
            { connectionId: providerConfig.id, providerName: providerConfig.name, status: 'connected' as const },
          ];

          const updatedSession = applyMCPChange(session, newMcpConnections);

          // Session state must be preserved
          expect(JSON.stringify(updatedSession.specDraft)).toBe(specDraftBefore);
          expect(JSON.stringify(updatedSession.activityFeed)).toBe(activityFeedBefore);
          expect(JSON.stringify(updatedSession.moderationHistory)).toBe(moderationHistoryBefore);

          // Only mcpConnections should differ
          expect(updatedSession.mcpConnections).not.toEqual(session.mcpConnections);
          expect(updatedSession.mcpConnections.length).toBe(session.mcpConnections.length + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('disconnect does not modify specDraft, activityFeed, or moderationHistory', () => {
    fc.assert(
      fc.property(
        arbSession().filter((s) => s.mcpConnections.length > 0),
        (session) => {
          // Snapshot the session state before disconnection
          const specDraftBefore = JSON.stringify(session.specDraft);
          const activityFeedBefore = JSON.stringify(session.activityFeed);
          const moderationHistoryBefore = JSON.stringify(session.moderationHistory);

          // Remove the first connection
          const newMcpConnections = session.mcpConnections.slice(1);
          const updatedSession = applyMCPChange(session, newMcpConnections);

          // Session state must be preserved
          expect(JSON.stringify(updatedSession.specDraft)).toBe(specDraftBefore);
          expect(JSON.stringify(updatedSession.activityFeed)).toBe(activityFeedBefore);
          expect(JSON.stringify(updatedSession.moderationHistory)).toBe(moderationHistoryBefore);

          // mcpConnections should have one fewer item
          expect(updatedSession.mcpConnections.length).toBe(session.mcpConnections.length - 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('session id, createdAt, updatedAt, artifacts, and status are also preserved', () => {
    fc.assert(
      fc.property(
        arbSession(),
        arbProviderConfig(),
        (session, providerConfig) => {
          const newMcpConnections = [
            ...session.mcpConnections,
            { connectionId: providerConfig.id, providerName: providerConfig.name, status: 'connected' as const },
          ];

          const updatedSession = applyMCPChange(session, newMcpConnections);

          // All non-mcpConnections fields preserved
          expect(updatedSession.id).toBe(session.id);
          expect(updatedSession.createdAt).toBe(session.createdAt);
          expect(updatedSession.updatedAt).toBe(session.updatedAt);
          expect(updatedSession.status).toBe(session.status);
          expect(JSON.stringify(updatedSession.artifacts)).toBe(JSON.stringify(session.artifacts));
        }
      ),
      { numRuns: 100 }
    );
  });
});

// === Property 26: No-data provider status ===

describe('Feature: spec-collider, Property 26: No-data provider status', () => {
  /**
   * Validates: Requirements 9.7
   *
   * For any MCPConnection where the connected provider returns no usable data,
   * the connection status SHALL be set to 'connected_no_data' rather than
   * 'connected' or 'error'.
   */

  it('marks connection as connected_no_data when provider returns no usable data', () => {
    fc.assert(
      fc.property(
        arbProviderConfigs(3),
        fc.integer({ min: 0, max: 2 }),
        (configs, noDataIndex) => {
          const manager = new MCPClientManager();

          // Connect providers
          for (const config of configs) {
            manager.connectSync(config);
          }

          // Mark the chosen one as no-data
          manager.markNoData(configs[noDataIndex].id);

          const connections = manager.getAllConnections();
          const noDataConnection = connections.find((c) => c.id === configs[noDataIndex].id);

          // Status must be 'connected_no_data', not 'connected' or 'error'
          expect(noDataConnection).toBeDefined();
          expect(noDataConnection!.status).toBe('connected_no_data');
          expect(noDataConnection!.status).not.toBe('connected');
          expect(noDataConnection!.status).not.toBe('error');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('connected_no_data status does not count as errored or unavailable', () => {
    fc.assert(
      fc.property(
        arbProviderConfig(),
        (config) => {
          const manager = new MCPClientManager();

          manager.connectSync(config);
          manager.markNoData(config.id);

          // connected_no_data is still "active" (not disconnected)
          const active = manager.getActiveConnections();
          expect(active.length).toBe(1);
          expect(active[0].status).toBe('connected_no_data');

          // connected_no_data is NOT in unavailable list (unavailable = error/disconnected)
          const unavailable = manager.getUnavailableProviderNames();
          expect(unavailable.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('only providers returning no data get connected_no_data status', () => {
    fc.assert(
      fc.property(
        arbProviderConfigs(MAX_MCP_CONNECTIONS),
        fc.array(fc.boolean(), { minLength: MAX_MCP_CONNECTIONS, maxLength: MAX_MCP_CONNECTIONS }),
        (configs, noDataFlags) => {
          const manager = new MCPClientManager();

          for (const config of configs) {
            manager.connectSync(config);
          }

          // Mark providers as no-data based on flags
          for (let i = 0; i < configs.length; i++) {
            if (noDataFlags[i]) {
              manager.markNoData(configs[i].id);
            }
          }

          const connections = manager.getAllConnections();
          for (let i = 0; i < configs.length; i++) {
            const conn = connections.find((c) => c.id === configs[i].id);
            expect(conn).toBeDefined();
            if (noDataFlags[i]) {
              expect(conn!.status).toBe('connected_no_data');
            } else {
              expect(conn!.status).toBe('connected');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
