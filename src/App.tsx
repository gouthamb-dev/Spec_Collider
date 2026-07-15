import { useState, useCallback, useEffect, useRef } from 'react';
import { WorkspaceLayout } from './components/WorkspaceLayout.tsx';
import { SpecDraftPanel } from './components/SpecDraftPanel.tsx';
import { ActivityFeedPanel } from './components/ActivityFeedPanel.tsx';
import { ArtifactsPanel } from './components/ArtifactsPanel.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { createWorkspaceStore } from './core/store.ts';
import { createIndexedDBSessionManager } from './integration/persistence.ts';
import type { ISessionManager } from './integration/persistence.ts';
import { validateIdeaInput } from './core/validation.ts';
import { ModerationService } from './core/moderation.ts';
import { ArtifactGenerator } from './core/artifact-generator.ts';
import { exportToFilesystem, type FsOps } from './integration/filesystem-writer.ts';
import { MCPClientManager } from './integration/mcp-client.ts';
import {
  AgentOrchestrator,
  buildAgentContext,
  DEFAULT_RED_TEAM_PROMPT,
  DEFAULT_ARCHITECT_PROMPT,
} from './agents/orchestrator.ts';
import type { AgentOrchestratorConfig } from './agents/orchestrator.ts';
import type { ModerationAction } from './types/ui.ts';
import type { Mitigation } from './types/domain.ts';
import type { MCPData } from './types/mcp.ts';
import { RedTeamStreamParser } from './agents/red-team-parser.ts';
import { ArchitectStreamParser } from './agents/architect-parser.ts';

// === App Configuration ===

const AGENT_CONFIG: AgentOrchestratorConfig = {
  endpointUrl: import.meta.env.VITE_API_ENDPOINT || '',
  redTeamSystemPrompt: DEFAULT_RED_TEAM_PROMPT,
  architectSystemPrompt: DEFAULT_ARCHITECT_PROMPT,
  timeoutMs: 30_000,
};

const EXPORT_BASE_PATH = import.meta.env.VITE_EXPORT_BASE_PATH ?? '.';

/**
 * Browser-safe FsOps implementation.
 * In a browser context, filesystem writes are a no-op that always "succeed".
 * Replace with File System Access API, Electron IPC, or backend call for real exports.
 */
const browserFsOps: FsOps = {
  mkdir: async () => undefined,
  writeFile: async () => {
    // No-op in browser — artifacts are stored in IndexedDB and shown in the UI.
    // Real filesystem export requires a Node.js backend or native bridge.
  },
};

// === Initialize services ===

let sessionManager: ISessionManager;
try {
  sessionManager = createIndexedDBSessionManager();
} catch {
  // Fallback: store without persistence if IndexedDB unavailable
  sessionManager = undefined as unknown as ISessionManager;
}

// === App Component ===

function App() {
  // Store initialization with IndexedDB persistence
  const storeRef = useRef(createWorkspaceStore(sessionManager));
  const store = storeRef.current;

  // Local state
  const [ideaText, setIdeaText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [exportErrors, setExportErrors] = useState<{ path: string; error: string }[]>([]);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [selectedArtifactVersion, setSelectedArtifactVersion] = useState<number | undefined>();

  // Service refs (stable across renders)
  const mcpClientRef = useRef(new MCPClientManager());
  const orchestratorRef = useRef(new AgentOrchestrator(AGENT_CONFIG));
  const artifactGeneratorRef = useRef(new ArtifactGenerator());

  // Track mitigations for moderation service
  const mitigationsRef = useRef<Mitigation[]>([]);

  // Responsive viewport tracking
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Subscribe to store state for reactive rendering
  // (retained for future re-render subscription use)
  void store.getState().session;
  void store.getState().isGenerating;
  void store.getState().connectionStatus;
  void store.getState().error;

  // Force re-render on store changes
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const unsub = store.subscribe(() => forceUpdate((n) => n + 1));
    return unsub;
  }, [store]);

  // Get fresh state on each render
  const currentState = store.getState();
  const currentSession = currentState.session;
  const currentIsGenerating = currentState.isGenerating;
  const currentConnectionStatus = currentState.connectionStatus;
  const currentError = currentState.error;

  // Check if finalize is allowed (at least one accepted decision)
  const hasAcceptedMitigations = currentSession.moderationHistory.some(
    (d) => d.action === 'accepted'
  );

  // === Idea Submission Pipeline ===

  const handleIdeaSubmit = useCallback(async () => {
    // Field-level validation
    const validation = validateIdeaInput(ideaText);
    if (!validation.valid) {
      setValidationError(validation.error ?? 'Invalid input');
      return;
    }
    setValidationError(null);

    const state = store.getState();
    if (state.isGenerating) return;

    store.getState().setGenerating(true);

    try {
      // 1. Submit idea event
      store.getState().submitIdea(ideaText);
      setIdeaText('');

      // 2. Build MCP context for agents
      const mcpContext = await gatherMCPContext();

      // 2.5. Generate spec draft from the idea
      try {
        const specDraftPrompt = `You are a software architect. Given a feature idea, generate an initial spec draft.

You MUST output your response as a JSON object with these exact fields:
- "overview": string (2-3 paragraph summary of what the system does and why)
- "proposedArchitecture": string (high-level architecture description with components)
- "dataModel": string (key data entities, their relationships, and storage approach)
- "apiSurface": string (main API endpoints or interfaces the system exposes)
- "assumptions": string (key assumptions and constraints)

Output ONLY the JSON object. No explanatory text before or after.`;

        const specDraftContext = {
          systemPrompt: specDraftPrompt,
          specDraft: store.getState().session.specDraft,
          activityHistory: store.getState().session.activityFeed,
          mcpContext,
        };

        let specDraftRaw = '';
        const specDraftOrchestrator = orchestratorRef.current;
        for await (const chunk of specDraftOrchestrator.invokeRedTeam(specDraftContext)) {
          if (!chunk.done) {
            specDraftRaw += chunk.content;
          }
        }

        // Parse the spec draft JSON
        const jsonMatch = specDraftRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const draft = JSON.parse(jsonMatch[0]) as {
              overview?: string;
              proposedArchitecture?: string;
              dataModel?: string;
              apiSurface?: string;
              assumptions?: string;
            };
            const currentDraft = store.getState().session.specDraft;
            store.getState().updateSpecDraft({
              ...currentDraft,
              overview: draft.overview ?? currentDraft.overview,
              proposedArchitecture: draft.proposedArchitecture ?? currentDraft.proposedArchitecture,
              dataModel: draft.dataModel ?? currentDraft.dataModel,
              apiSurface: draft.apiSurface ?? currentDraft.apiSurface,
              assumptions: draft.assumptions ?? currentDraft.assumptions,
              lastModified: Date.now(),
              version: currentDraft.version + 1,
            });
          } catch {
            // If JSON parse fails, use raw text as overview
            const currentDraft = store.getState().session.specDraft;
            store.getState().updateSpecDraft({
              ...currentDraft,
              overview: specDraftRaw,
              lastModified: Date.now(),
              version: currentDraft.version + 1,
            });
          }
        }
      } catch (err) {
        // Non-fatal: spec draft generation failed, continue with empty draft
        console.warn('[App] Spec draft generation failed:', err);
      }

      // 3. Invoke Red Team
      const redTeamContext = buildAgentContext(
        'red_team_agent',
        store.getState().session.specDraft,
        store.getState().session.activityFeed,
        mcpContext,
        AGENT_CONFIG,
      );

      try {
        const redTeamParser = new RedTeamStreamParser(false);
        for await (const chunk of orchestratorRef.current.invokeRedTeam(redTeamContext)) {
          if (!chunk.done) {
            redTeamParser.addChunk(chunk.content);
            store.getState().dispatchEvent({
              type: 'stream_chunk',
              payload: { source: 'red_team_agent', content: chunk.content },
            });
          }
        }
        // Mark the red team entry as stream complete
        const state = store.getState();
        const feed = state.session.activityFeed;
        const redEntry = feed.find(
          (e) => e.contributor === 'red_team_agent' && !e.streamComplete
        );
        if (redEntry) {
          const updatedFeed = feed.map((e) =>
            e.id === redEntry.id ? { ...e, streamComplete: true } : e
          );
          store.setState({
            session: { ...state.session, activityFeed: updatedFeed },
          });
        }

        // Parse structured risks from the accumulated output
        const risks = redTeamParser.finalize();
        for (const risk of risks) {
          store.getState().dispatchEvent({
            type: 'risk_identified',
            payload: { risk },
          });
        }
      } catch (err) {
        // Feed-level error for agent failure
        store.getState().dispatchEvent({
          type: 'error',
          payload: {
            source: 'red_team_agent',
            message: err instanceof Error ? err.message : 'Red Team agent failed',
            retryable: true,
          },
        });
      }

      // 4. Invoke Architect
      const architectContext = buildAgentContext(
        'architect_agent',
        store.getState().session.specDraft,
        store.getState().session.activityFeed,
        mcpContext,
        AGENT_CONFIG,
      );

      try {
        const architectParser = new ArchitectStreamParser();
        for await (const chunk of orchestratorRef.current.invokeArchitect(architectContext)) {
          if (!chunk.done) {
            architectParser.addChunk(chunk.content);
            store.getState().dispatchEvent({
              type: 'stream_chunk',
              payload: { source: 'architect_agent', content: chunk.content },
            });
          }
        }
        // Mark the architect entry as stream complete
        const archState = store.getState();
        const archFeed = archState.session.activityFeed;
        const archEntry = archFeed.find(
          (e) => e.contributor === 'architect_agent' && !e.streamComplete
        );
        if (archEntry) {
          const updatedFeed = archFeed.map((e) =>
            e.id === archEntry.id ? { ...e, streamComplete: true } : e
          );
          store.setState({
            session: { ...archState.session, activityFeed: updatedFeed },
          });
        }

        // Parse structured mitigations from the accumulated output
        const mitigations = architectParser.finalize();
        mitigationsRef.current = mitigations;
        for (const mitigation of mitigations) {
          store.getState().dispatchEvent({
            type: 'mitigation_proposed',
            payload: { mitigation },
          });
        }
      } catch (err) {
        // Feed-level error for agent failure
        store.getState().dispatchEvent({
          type: 'error',
          payload: {
            source: 'architect_agent',
            message: err instanceof Error ? err.message : 'Architect agent failed',
            retryable: true,
          },
        });
      }
    } catch (err) {
      // General pipeline error
      store.getState().setError(
        err instanceof Error ? err.message : 'Pipeline failed'
      );
    } finally {
      store.getState().setGenerating(false);
    }
  }, [ideaText, store]);

  // === Moderation Handler ===

  const handleModerate = useCallback(
    async (mitigationId: string, action: ModerationAction) => {
      const state = store.getState();
      const moderationService = new ModerationService(
        state.session.specDraft,
        mitigationsRef.current,
        state.session.moderationHistory,
      );

      try {
        let updatedDraft;
        switch (action.type) {
          case 'accept':
            updatedDraft = await moderationService.accept(mitigationId);
            break;
          case 'reject':
            await moderationService.reject(mitigationId, action.reason);
            break;
          case 'edit':
            updatedDraft = await moderationService.edit(mitigationId, action.modifiedText);
            break;
        }

        // Record the decision in the store
        const decisions = moderationService.getDecisions();
        const latestDecision = decisions[decisions.length - 1];
        if (latestDecision) {
          store.getState().makeDecision(latestDecision);
        }

        // Update spec draft if it was modified
        if (updatedDraft) {
          store.getState().updateSpecDraft(updatedDraft);
        }
      } catch (err) {
        // Field-level validation error or mitigation not found
        store.getState().setError(
          err instanceof Error ? err.message : 'Moderation action failed'
        );
      }
    },
    [store],
  );

  // === Simulate Chaos ===

  const handleSimulateChaos = useCallback(async () => {
    const state = store.getState();
    if (state.isGenerating) return;

    store.getState().setGenerating(true);
    store.getState().triggerChaos();

    try {
      const mcpContext = await gatherMCPContext();
      const chaosContext = buildAgentContext(
        'red_team_agent',
        store.getState().session.specDraft,
        store.getState().session.activityFeed,
        mcpContext,
        AGENT_CONFIG,
      );

      for await (const chunk of orchestratorRef.current.invokeChaos(chaosContext)) {
        if (!chunk.done) {
          store.getState().dispatchEvent({
            type: 'stream_chunk',
            payload: { source: 'red_team_agent', content: chunk.content },
          });
        }
      }
    } catch (err) {
      store.getState().dispatchEvent({
        type: 'error',
        payload: {
          source: 'chaos',
          message: err instanceof Error ? err.message : 'Chaos simulation failed',
          retryable: true,
        },
      });
    } finally {
      store.getState().setGenerating(false);
    }
  }, [store]);

  // === Finalize Spec ===

  const handleFinalizeSpec = useCallback(async () => {
    const state = store.getState();
    if (state.isGenerating) return;

    store.getState().setGenerating(true);
    setExportErrors([]);

    try {
      // Generate artifacts
      const artifacts = await artifactGeneratorRef.current.generateAll(state.session);

      // Record each artifact in the store
      for (const artifact of artifacts) {
        store.getState().generateArtifact(artifact);
      }

      // Export to filesystem
      const result = await exportToFilesystem(artifacts, EXPORT_BASE_PATH, browserFsOps);

      if (!result.success) {
        setExportErrors(result.failedFiles);
        setPersistenceError(
          `Export partially failed: ${result.failedFiles.length} file(s) could not be written.`
        );
      }
    } catch (err) {
      setPersistenceError(
        err instanceof Error ? err.message : 'Finalize failed'
      );
    } finally {
      store.getState().setGenerating(false);
    }
  }, [store]);

  // === Retry Export ===

  const handleRetryExport = useCallback(async () => {
    const state = store.getState();
    const latestArtifacts = state.session.artifacts.map((va) => ({
      id: va.artifactId,
      type: va.type,
      content: va.versions[va.versions.length - 1]?.content ?? '',
      generatedAt: va.versions[va.versions.length - 1]?.generatedAt ?? Date.now(),
    }));

    setExportErrors([]);
    const result = await exportToFilesystem(latestArtifacts, EXPORT_BASE_PATH, browserFsOps);
    if (!result.success) {
      setExportErrors(result.failedFiles);
    } else {
      setPersistenceError(null);
    }
  }, [store]);

  // === MCP Context Gathering ===

  async function gatherMCPContext(): Promise<MCPData[]> {
    const connections = mcpClientRef.current.getActiveConnections();
    const contextData: MCPData[] = [];

    for (const conn of connections) {
      try {
        const data = await mcpClientRef.current.queryContext(conn.id, 'current-context');
        if (data) {
          contextData.push(data);
        }
      } catch {
        // Mark connection as errored; label entries as partially grounded
        mcpClientRef.current.markError(conn.id, 'Failed to query context');
        store.getState().updateMCPStatus(conn.id, 'disconnected');
      }
    }

    return contextData;
  }

  // === Version Select ===

  const handleVersionSelect = useCallback((_artifactId: string, version: number) => {
    setSelectedArtifactVersion(version);
  }, []);

  // === Render ===

  return (
    <div className="flex h-screen flex-col bg-background text-background-on">
      {/* Banner-level persistence/error notifications */}
      {(persistenceError || currentError) && (
        <div
          className="sticky top-0 z-50 flex items-center justify-between bg-error-container px-4 py-2 text-sm font-medium text-error-on-container"
          role="alert"
          aria-live="assertive"
          data-testid="error-banner"
        >
          <span>{persistenceError ?? currentError}</span>
          <button
            onClick={() => {
              setPersistenceError(null);
              store.getState().clearError();
            }}
            className="ml-4 rounded-md bg-error px-2 py-1 text-xs text-error-on hover:opacity-90"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <Toolbar
        onSimulateChaos={handleSimulateChaos}
        onFinalizeSpec={handleFinalizeSpec}
        hasAcceptedMitigations={hasAcceptedMitigations}
        isGenerating={currentIsGenerating}
        mcpConnections={currentSession.mcpConnections}
      />

      {/* Idea submission input */}
      <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container px-4 py-3">
        <input
          type="text"
          value={ideaText}
          onChange={(e) => {
            setIdeaText(e.target.value);
            setValidationError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !currentIsGenerating) {
              handleIdeaSubmit();
            }
          }}
          placeholder="Enter your feature idea (10–5000 characters)..."
          disabled={currentIsGenerating}
          className="flex-1 rounded-md border border-outline bg-surface px-3 py-2 text-sm text-surface-on placeholder:text-surface-on-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          aria-label="Feature idea input"
          aria-describedby={validationError ? 'idea-validation-error' : undefined}
          data-testid="idea-input"
        />
        <button
          onClick={handleIdeaSubmit}
          disabled={currentIsGenerating}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-on transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="submit-idea-button"
        >
          Submit
        </button>
        {validationError && (
          <span
            id="idea-validation-error"
            className="text-xs text-error"
            role="alert"
            data-testid="validation-error"
          >
            {validationError}
          </span>
        )}
      </div>

      {/* Workspace panels */}
      <div className="flex-1 overflow-hidden">
        <WorkspaceLayout
          sessionId={currentSession.id}
          viewportWidth={viewportWidth}
        >
          {{
            specDraft: (
              <SpecDraftPanel
                specDraft={currentSession.specDraft}
                isStreaming={currentIsGenerating}
                error={currentError}
                onRetry={handleIdeaSubmit}
              />
            ),
            activityFeed: (
              <ActivityFeedPanel
                entries={currentSession.activityFeed}
                onModerate={handleModerate}
                connectionStatus={currentConnectionStatus}
              />
            ),
            artifacts: (
              <ArtifactsPanel
                artifacts={currentSession.artifacts}
                selectedVersion={selectedArtifactVersion}
                onVersionSelect={handleVersionSelect}
                exportErrors={exportErrors.length > 0 ? exportErrors : undefined}
                onRetryExport={handleRetryExport}
              />
            ),
          }}
        </WorkspaceLayout>
      </div>
    </div>
  );
}

export default App;
