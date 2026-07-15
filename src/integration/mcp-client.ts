import type { MCPProviderConfig, MCPConnection, MCPData } from '../types/mcp.ts';
import type { Session } from '../types/domain.ts';

/**
 * Maximum number of simultaneous MCP connections allowed.
 */
export const MAX_MCP_CONNECTIONS = 5;

/**
 * Error thrown when attempting to exceed the connection cap.
 */
export class MCPConnectionCapError extends Error {
  constructor() {
    super(`Cannot exceed ${MAX_MCP_CONNECTIONS} simultaneous MCP connections`);
    this.name = 'MCPConnectionCapError';
  }
}

/**
 * MCP Client Manager implementing IMCPClientManager interface.
 *
 * Manages connections to external Context_Providers via MCP.
 * - Enforces a cap of 5 simultaneous connections
 * - Tracks connection status (connected, disconnected, error, connected_no_data)
 * - Ensures connect/disconnect does not modify session state
 * - Handles mid-analysis disconnection gracefully
 */
export class MCPClientManager {
  private connections: Map<string, MCPConnection> = new Map();

  /**
   * Connect to an external Context_Provider (synchronous core logic).
   * Throws MCPConnectionCapError if the connection would exceed MAX_MCP_CONNECTIONS.
   */
  connectSync(providerConfig: MCPProviderConfig): MCPConnection {
    const activeCount = this.getActiveConnections().length;
    if (activeCount >= MAX_MCP_CONNECTIONS) {
      throw new MCPConnectionCapError();
    }

    const connection: MCPConnection = {
      id: providerConfig.id,
      config: providerConfig,
      status: 'connected',
      connectedAt: Date.now(),
    };

    this.connections.set(connection.id, connection);
    return connection;
  }

  /**
   * Connect to an external Context_Provider (async wrapper for real MCP SDK use).
   * Rejects if the connection would exceed MAX_MCP_CONNECTIONS.
   */
  async connect(providerConfig: MCPProviderConfig): Promise<MCPConnection> {
    return this.connectSync(providerConfig);
  }

  /**
   * Disconnect an existing Context_Provider connection (synchronous core logic).
   * Does not modify session state (specDraft, activityFeed, moderationHistory).
   */
  disconnectSync(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.status = 'disconnected';
      this.connections.delete(connectionId);
    }
  }

  /**
   * Disconnect an existing Context_Provider connection (async wrapper).
   */
  async disconnect(connectionId: string): Promise<void> {
    this.disconnectSync(connectionId);
  }

  /**
   * Get all currently active connections (status !== 'disconnected').
   */
  getActiveConnections(): MCPConnection[] {
    return Array.from(this.connections.values()).filter(
      (c) => c.status !== 'disconnected'
    );
  }

  /**
   * Get all connections regardless of status.
   */
  getAllConnections(): MCPConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Query context data from a connected provider.
   * If the provider returns no usable data, updates status to 'connected_no_data'.
   */
  async queryContext(connectionId: string, _query: string): Promise<MCPData | null> {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.status === 'disconnected') {
      return null;
    }

    // In a real implementation, this would call the MCP SDK.
    // For now, we simulate the protocol behavior.
    return {
      providerId: connection.config.id,
      providerName: connection.config.name,
      data: {},
      retrievedAt: Date.now(),
    };
  }

  /**
   * Mark a connection as having no usable data.
   * Sets status to 'connected_no_data'.
   */
  markNoData(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.status = 'connected_no_data';
    }
  }

  /**
   * Mark a connection as errored (e.g., connection dropped).
   */
  markError(connectionId: string, error: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.status = 'error';
      connection.lastError = error;
    }
  }

  /**
   * Get the names of providers that are currently unavailable (error or disconnected).
   */
  getUnavailableProviderNames(): string[] {
    return Array.from(this.connections.values())
      .filter((c) => c.status === 'error' || c.status === 'disconnected')
      .map((c) => c.config.name);
  }
}

/**
 * Labels an activity entry with unavailable provider information.
 * Used when providers fail or drop mid-analysis.
 */
export function labelEntryWithUnavailableProviders(
  entry: { partiallyGrounded: boolean; unavailableProviders: string[] },
  unavailableProviders: string[]
): void {
  if (unavailableProviders.length > 0) {
    entry.partiallyGrounded = true;
    entry.unavailableProviders = [...unavailableProviders];
  }
}

/**
 * Connects/disconnects providers on a session without modifying core session state.
 * Returns a new session with only mcpConnections changed.
 */
export function applyMCPChange(
  session: Session,
  mcpConnections: Session['mcpConnections']
): Session {
  return {
    ...session,
    mcpConnections,
  };
}
