export interface MCPProviderConfig {
  id: string;
  name: string;
  uri: string;
  capabilities: string[];
}

export interface MCPConnection {
  id: string;
  config: MCPProviderConfig;
  status: 'connected' | 'disconnected' | 'error' | 'connected_no_data';
  connectedAt?: number;
  lastError?: string;
}

export interface MCPConnectionState {
  connectionId: string;
  providerName: string;
  status: MCPConnection['status'];
}

export interface MCPData {
  providerId: string;
  providerName: string;
  data: Record<string, unknown>;
  retrievedAt: number;
}
