import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Toolbar, type ToolbarProps } from '../../src/components/Toolbar';
import type { MCPConnectionState } from '../../src/types/mcp';

function renderToolbar(overrides: Partial<ToolbarProps> = {}) {
  const defaultProps: ToolbarProps = {
    onSimulateChaos: vi.fn(),
    onFinalizeSpec: vi.fn(),
    hasAcceptedMitigations: true,
    isGenerating: false,
    mcpConnections: [],
    ...overrides,
  };
  return { ...render(<Toolbar {...defaultProps} />), props: defaultProps };
}

describe('Toolbar', () => {
  it('renders both action buttons', () => {
    renderToolbar();
    expect(screen.getByTestId('btn-simulate-chaos')).toBeInTheDocument();
    expect(screen.getByTestId('btn-finalize-spec')).toBeInTheDocument();
  });

  it('has correct accessible role and label', () => {
    renderToolbar();
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveAccessibleName('Workspace actions');
  });

  describe('Simulate Chaos button', () => {
    it('calls onSimulateChaos when clicked and not generating', () => {
      const onSimulateChaos = vi.fn();
      renderToolbar({ onSimulateChaos });

      fireEvent.click(screen.getByTestId('btn-simulate-chaos'));
      expect(onSimulateChaos).toHaveBeenCalledOnce();
    });

    it('is disabled when isGenerating is true', () => {
      renderToolbar({ isGenerating: true });
      const btn = screen.getByTestId('btn-simulate-chaos');

      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).toHaveClass('cursor-not-allowed');
      expect(btn).toHaveClass('opacity-50');
    });

    it('is enabled when isGenerating is false', () => {
      renderToolbar({ isGenerating: false });
      const btn = screen.getByTestId('btn-simulate-chaos');

      expect(btn).not.toBeDisabled();
      expect(btn).toHaveAttribute('aria-disabled', 'false');
    });
  });

  describe('Finalize Spec button', () => {
    it('calls onFinalizeSpec when enabled and clicked', () => {
      const onFinalizeSpec = vi.fn();
      renderToolbar({ onFinalizeSpec, hasAcceptedMitigations: true, isGenerating: false });

      fireEvent.click(screen.getByTestId('btn-finalize-spec'));
      expect(onFinalizeSpec).toHaveBeenCalledOnce();
    });

    it('is disabled when hasAcceptedMitigations is false', () => {
      renderToolbar({ hasAcceptedMitigations: false });
      const btn = screen.getByTestId('btn-finalize-spec');

      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).toHaveClass('cursor-not-allowed');
      expect(btn).toHaveClass('opacity-50');
    });

    it('is disabled when isGenerating is true (even with accepted mitigations)', () => {
      renderToolbar({ hasAcceptedMitigations: true, isGenerating: true });
      const btn = screen.getByTestId('btn-finalize-spec');

      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-disabled', 'true');
    });

    it('is enabled only when hasAcceptedMitigations and not generating', () => {
      renderToolbar({ hasAcceptedMitigations: true, isGenerating: false });
      const btn = screen.getByTestId('btn-finalize-spec');

      expect(btn).not.toBeDisabled();
      expect(btn).toHaveAttribute('aria-disabled', 'false');
    });
  });

  describe('MCP connection status indicators', () => {
    const connections: MCPConnectionState[] = [
      { connectionId: 'conn-1', providerName: 'GitHub', status: 'connected' },
      { connectionId: 'conn-2', providerName: 'Jira', status: 'error' },
      { connectionId: 'conn-3', providerName: 'Confluence', status: 'disconnected' },
      { connectionId: 'conn-4', providerName: 'Notion', status: 'connected_no_data' },
    ];

    it('renders a badge for each MCP connection', () => {
      renderToolbar({ mcpConnections: connections });

      for (const conn of connections) {
        expect(screen.getByTestId(`mcp-status-${conn.connectionId}`)).toBeInTheDocument();
      }
    });

    it('displays provider names in badges', () => {
      renderToolbar({ mcpConnections: connections });

      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('Jira')).toBeInTheDocument();
      expect(screen.getByText('Confluence')).toBeInTheDocument();
      expect(screen.getByText('Notion')).toBeInTheDocument();
    });

    it('shows correct title/tooltip per status', () => {
      renderToolbar({ mcpConnections: connections });

      expect(screen.getByTestId('mcp-status-conn-1')).toHaveAttribute('title', 'GitHub: Connected');
      expect(screen.getByTestId('mcp-status-conn-2')).toHaveAttribute('title', 'Jira: Error');
      expect(screen.getByTestId('mcp-status-conn-3')).toHaveAttribute('title', 'Confluence: Disconnected');
      expect(screen.getByTestId('mcp-status-conn-4')).toHaveAttribute('title', 'Notion: No data');
    });

    it('does not render MCP section when no connections exist', () => {
      renderToolbar({ mcpConnections: [] });
      expect(screen.queryByLabelText('MCP connection status')).not.toBeInTheDocument();
    });

    it('uses correct color classes for each status', () => {
      renderToolbar({
        mcpConnections: [
          { connectionId: 'c1', providerName: 'A', status: 'connected' },
        ],
      });

      const badge = screen.getByTestId('mcp-status-c1');
      const dot = badge.querySelector('span[aria-hidden="true"]');
      expect(dot).toHaveClass('bg-tertiary');
    });
  });
});
