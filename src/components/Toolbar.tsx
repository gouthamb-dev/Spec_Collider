import type { MCPConnectionState } from '../types/mcp';

export interface ToolbarProps {
  onSimulateChaos: () => void;
  onFinalizeSpec: () => void;
  hasAcceptedMitigations: boolean;
  isGenerating: boolean;
  mcpConnections: MCPConnectionState[];
}

const STATUS_COLORS: Record<MCPConnectionState['status'], { bg: string; label: string }> = {
  connected: { bg: 'bg-tertiary', label: 'Connected' },
  connected_no_data: { bg: 'bg-[#E8A317]', label: 'No data' },
  error: { bg: 'bg-error', label: 'Error' },
  disconnected: { bg: 'bg-outline', label: 'Disconnected' },
};

/**
 * Toolbar provides primary action buttons and MCP connection status indicators.
 *
 * - "Simulate Chaos" uses Secondary color token, disabled while generating.
 * - "Finalize Spec" uses Primary color token, disabled when no accepted mitigations or generating.
 * - MCP indicators show color-coded badges per provider.
 */
export function Toolbar({
  onSimulateChaos,
  onFinalizeSpec,
  hasAcceptedMitigations,
  isGenerating,
  mcpConnections,
}: ToolbarProps) {
  const isFinalizeDisabled = !hasAcceptedMitigations || isGenerating;
  const isChaosDisabled = isGenerating;

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 border-b border-outline-variant bg-surface-container"
      role="toolbar"
      aria-label="Workspace actions"
      data-testid="toolbar"
    >
      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSimulateChaos}
          disabled={isChaosDisabled}
          aria-disabled={isChaosDisabled}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            isChaosDisabled
              ? 'bg-secondary opacity-50 cursor-not-allowed text-secondary-on'
              : 'bg-secondary text-secondary-on hover:opacity-90'
          }`}
          data-testid="btn-simulate-chaos"
        >
          Simulate Chaos
        </button>

        <button
          type="button"
          onClick={onFinalizeSpec}
          disabled={isFinalizeDisabled}
          aria-disabled={isFinalizeDisabled}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            isFinalizeDisabled
              ? 'bg-primary opacity-50 cursor-not-allowed text-primary-on'
              : 'bg-primary text-primary-on hover:opacity-90'
          }`}
          data-testid="btn-finalize-spec"
        >
          Finalize Spec
        </button>
      </div>

      {/* MCP Connection Status Indicators */}
      {mcpConnections.length > 0 && (
        <div className="ml-auto flex items-center gap-2" aria-label="MCP connection status">
          {mcpConnections.map((conn) => {
            const statusInfo = STATUS_COLORS[conn.status];
            return (
              <div
                key={conn.connectionId}
                className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1 text-xs"
                title={`${conn.providerName}: ${statusInfo.label}`}
                data-testid={`mcp-status-${conn.connectionId}`}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${statusInfo.bg}`}
                  aria-hidden="true"
                />
                <span className="text-surface-on-variant">{conn.providerName}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
