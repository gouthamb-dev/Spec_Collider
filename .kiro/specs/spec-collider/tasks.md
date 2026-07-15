# Implementation Plan: Spec Collider

## Overview

Implement a multiplayer collaborative workspace where humans and AI agents co-design software architecture through structured adversarial debate. The implementation follows a layered architecture: UI Layer (React + Tailwind MD3), Core Layer (Session Manager, Agent Orchestrator, Moderation Flow, Artifact Generator), AI Agent Layer (isolated Red Team and Architect agents), and Integration Layer (MCP Client, IndexedDB Persistence, Filesystem Writer). Built with TypeScript, React 18 + Vite, Zustand, Tailwind CSS, and Vitest + fast-check for testing.

## Tasks

- [x] 1. Set up project structure, tooling, and core type definitions
  - [x] 1.1 Initialize Vite + React 18 + TypeScript project with Tailwind CSS
    - Initialize project with `npm create vite@latest` using react-ts template
    - Install dependencies: zustand, tailwindcss, postcss, autoprefixer, vitest, fast-check, @modelcontextprotocol/sdk
    - Configure Tailwind with MD3 design tokens (Primary #7C580D, Secondary #6D5C3F, Tertiary #4E6543, Background #FFF8F3, Surface #FFF8F3, Error #BA1A1A, and all container/on variants)
    - Configure Vitest in vitest.config.ts
    - Create directory structure: src/components/, src/core/, src/agents/, src/integration/, src/types/, tests/properties/, tests/unit/
    - _Requirements: 8.2_

  - [x] 1.2 Define core TypeScript interfaces and data models
    - Create src/types/domain.ts with Session, SpecDraft, Risk, Mitigation, ModerationDecision, ActivityEntry, Artifact, VersionedArtifact interfaces
    - Create src/types/events.ts with WorkspaceEvent union type
    - Create src/types/mcp.ts with MCPProviderConfig, MCPConnection, MCPConnectionState, MCPData interfaces
    - Create src/types/streaming.ts with StreamChunk, AgentRole types
    - Create src/types/ui.ts with ValidationResult, ConflictResult, ExportResult, ConnectionStatus, ModerationAction types
    - _Requirements: 2.2, 3.2, 4.2, 5.4, 7.1, 9.1_

  - [x] 1.3 Create test setup and fast-check generators
    - Create tests/setup.ts with shared test utilities
    - Create tests/generators.ts with arbitraries: arbInputText, arbSpecDraft, arbRisk, arbMitigation, arbModerationDecision, arbActivityEntry, arbSession, arbAgentContext, arbMCPConnection, arbViewportWidth
    - Ensure generators produce valid domain objects with correct enum values and field constraints
    - _Requirements: All (testing infrastructure)_

- [x] 2. Implement validation layer and idea submission
  - [x] 2.1 Implement input validation module
    - Create src/core/validation.ts with validateIdeaInput(text: string): ValidationResult (10–5000 chars)
    - Implement validateRejectionReason(reason: string): ValidationResult (1–1000 chars)
    - Implement validateEditText(text: string): ValidationResult (1–5000 chars)
    - Return structured error messages indicating allowed length bounds on failure
    - _Requirements: 1.1, 4.3, 4.4_

  - [x] 2.2 Write property tests for input validation
    - **Property 1: Input length validation**
    - **Validates: Requirements 1.1**
    - Test that strings with length 10–5000 are accepted, strings outside that range are rejected
    - Test rejection reason validation (1–1000 chars)
    - Test edit text validation (1–5000 chars)
    - **Property 9: Reject validation and state preservation**
    - **Validates: Requirements 4.3**
    - **Property 10: Edit validation and application**
    - **Validates: Requirements 4.4**

  - [x] 2.3 Implement SpecDraft generation service
    - Create src/core/spec-draft-generator.ts implementing idea-to-SpecDraft transformation
    - Use OpenAI-compatible streaming API to generate structured SpecDraft with all 5 sections (overview, proposedArchitecture, dataModel, apiSurface, assumptions)
    - Implement streaming via AsyncGenerator<StreamChunk> for token-by-token delivery
    - Store original input text for recovery on failure
    - Implement duplicate submission prevention (disable while in-progress)
    - _Requirements: 1.2, 1.3, 1.5, 1.6_

  - [x] 2.4 Write property tests for SpecDraft structural completeness
    - **Property 2: SpecDraft structural completeness**
    - **Validates: Requirements 1.3**
    - Verify all generated SpecDraft objects have all 5 non-empty sections
    - **Property 3: Input preservation on generation failure**
    - **Validates: Requirements 1.5**
    - Verify original input is preserved across failure scenarios

- [x] 3. Implement AI Agent Layer with isolation
  - [x] 3.1 Implement Agent Orchestrator with context isolation
    - Create src/agents/orchestrator.ts implementing IAgentOrchestrator interface
    - Implement invokeRedTeam(context: AgentContext): AsyncGenerator<StreamChunk>
    - Implement invokeArchitect(context: AgentContext): AsyncGenerator<StreamChunk>
    - Implement invokeChaos(context: AgentContext): AsyncGenerator<StreamChunk>
    - Construct AgentContext with only the agent's own system prompt + specDraft + activityHistory + mcpContext (never cross-contaminate)
    - Implement 30-second timeout with error recovery and retry action
    - _Requirements: 2.1, 3.1, 10.1, 10.2, 10.6_

  - [x] 3.2 Implement Red Team Agent output parser
    - Create src/agents/red-team-parser.ts to parse streaming output into structured Risk objects
    - Validate each Risk conforms to the Risk interface (title, category, severity, description, affectedComponents, evidence)
    - Set isChaosRound flag based on invocation context
    - Integrate MCP context data as evidence when Context_Provider is connected
    - _Requirements: 2.2, 2.3, 2.5, 10.3_

  - [x] 3.3 Implement Architect Agent output parser
    - Create src/agents/architect-parser.ts to parse streaming output into structured Mitigation objects
    - Validate each Mitigation references a Risk by title and has responseType (fix, trade_off, accepted_risk)
    - Ensure technologies array contains specific named technologies/patterns
    - Integrate MCP context citations in mcpEvidence field
    - _Requirements: 3.2, 3.3, 3.5, 10.4_

  - [x] 3.4 Write property tests for agent output and isolation
    - **Property 4: Red Team output exclusivity and structure**
    - **Validates: Requirements 2.2, 10.3**
    - **Property 5: Chaos round labeling**
    - **Validates: Requirements 2.5**
    - **Property 6: Architect output exclusivity and structure**
    - **Validates: Requirements 3.2, 10.4**
    - **Property 27: Agent context isolation**
    - **Validates: Requirements 10.2**
    - **Property 28: Prompt injection resistance**
    - **Validates: Requirements 10.6**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Moderation Flow
  - [x] 5.1 Implement moderation service with conflict detection
    - Create src/core/moderation.ts implementing IModerationFlow interface
    - Implement accept(mitigationId): apply change to SpecDraft, record ModerationDecision with timestamp
    - Implement reject(mitigationId, reason): validate reason length, record decision, preserve SpecDraft unchanged
    - Implement edit(mitigationId, modifiedText): validate text length, require user confirmation, apply modified text
    - Implement checkConflict(mitigationId, specDraft): detect when a Mitigation targets a section already modified by a prior accepted decision
    - Implement cancel behavior: discard uncommitted input, return controls to initial state
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_

  - [x] 5.2 Write property tests for moderation flow
    - **Property 8: Accept state transition**
    - **Validates: Requirements 4.2**
    - **Property 9: Reject validation and state preservation**
    - **Validates: Requirements 4.3**
    - **Property 10: Edit validation and application**
    - **Validates: Requirements 4.4**
    - **Property 12: Cancel preserves state**
    - **Validates: Requirements 4.6**
    - **Property 13: Conflict detection**
    - **Validates: Requirements 4.7**

- [x] 6. Implement Activity Feed logic
  - [x] 6.1 Implement Activity Feed store and entry management
    - Create src/core/activity-feed.ts with Zustand store for ActivityEntry[] management
    - Implement chronological ordering (ascending timestamp)
    - Implement entry creation for all event types (idea_submitted, risk_identified, mitigation_proposed, decision_made, chaos_triggered)
    - Implement contributor identity mapping (user → Primary, red_team_agent → Error/distinct color, architect_agent → Tertiary)
    - Implement relative time formatting (<24h) and date-time formatting (≥24h, YYYY-MM-DD HH:MM)
    - Support up to 500 entries with scroll position preservation
    - Implement empty state for zero entries
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 6.2 Implement Mitigation grouping logic
    - Create grouping function that groups Mitigations by riskId in the Activity Feed display
    - Ensure every Mitigation in a group shares the same riskId and no riskId spans multiple groups
    - _Requirements: 3.4_

  - [x] 6.3 Write property tests for Activity Feed
    - **Property 7: Mitigation grouping by Risk**
    - **Validates: Requirements 3.4**
    - **Property 11: Moderation decision creates correct ActivityEntry**
    - **Validates: Requirements 4.5**
    - **Property 14: Activity Feed chronological ordering and time formatting**
    - **Validates: Requirements 5.1**
    - **Property 15: Contributor identity consistency**
    - **Validates: Requirements 5.2, 10.5**
    - **Property 16: Valid entry action types**
    - **Validates: Requirements 5.4**

- [x] 7. Implement Artifact Generation and Export
  - [x] 7.1 Implement Artifact Generator
    - Create src/core/artifact-generator.ts implementing IArtifactGenerator interface
    - Implement generateAll(session): produce requirements.md, design.md, tasks.md, adr.md based on accepted state
    - Implement conditional steering-rules.md generation when user enables it
    - Enforce finalize precondition: at least one accepted ModerationDecision required
    - Ensure tasks.md contains at least N tasks for N accepted Mitigations
    - Ensure adr.md contains one ADR per trade-off decision
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.2 Implement filesystem writer with routing
    - Create src/integration/filesystem-writer.ts implementing exportToFilesystem
    - Route steering_rules artifacts to .kiro/steering/ directory
    - Route all other artifacts (requirements, design, tasks, adr) to .kiro/specs/ directory
    - Create directories if they don't exist
    - Handle write failures per-file with error reporting and "Retry Export" action
    - _Requirements: 6.7, 6.9_

  - [x] 7.3 Implement versioned artifact storage
    - Create src/core/versioned-artifacts.ts managing VersionedArtifact with version history
    - Enforce 50-version cap per artifact (evict oldest when exceeded)
    - Support version selection and retrieval
    - _Requirements: 7.3_

  - [x] 7.4 Write property tests for artifact generation and export
    - **Property 17: Finalize precondition**
    - **Validates: Requirements 6.1**
    - **Property 18: Artifact generation completeness**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**
    - **Property 19: Artifact filesystem routing**
    - **Validates: Requirements 6.7**
    - **Property 20: Version history cap**
    - **Validates: Requirements 7.3**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Session Persistence
  - [x] 9.1 Implement IndexedDB persistence store
    - Create src/integration/persistence.ts implementing ISessionManager with IndexedDB
    - Implement createSession, loadSession, saveSession, getSessionHistory
    - Auto-persist within 2 seconds of any state-changing action
    - Restore full session state within 5 seconds (specDraft, activityFeed, moderationHistory, artifacts, panel positions)
    - _Requirements: 7.1, 7.2_

  - [x] 9.2 Implement save retry logic
    - Implement automatic retry on save failure: retry up to 3 times with 5-second intervals
    - After 3 failures: display persistent error notification, preserve unsaved state in memory
    - Show visible error indicator on each failed attempt
    - _Requirements: 7.4, 7.5_

  - [x] 9.3 Write property tests for persistence
    - **Property 21: Save retry logic**
    - **Validates: Requirements 7.4, 7.5**
    - Verify exactly 3 retries occur, no further automatic retries after exhaustion, persistent notification triggered

- [x] 10. Implement MCP Integration
  - [x] 10.1 Implement MCP Client Manager
    - Create src/integration/mcp-client.ts implementing IMCPClientManager using official MCP TypeScript SDK
    - Implement connect/disconnect with up to 5 simultaneous connections (reject beyond cap)
    - Track connection status (connected, disconnected, error, connected_no_data)
    - Include MCP data in agent context within 10 seconds of connection
    - Handle mid-analysis disconnection: complete with existing data, label as partially grounded
    - Ensure connect/disconnect does not modify session state (specDraft, activityFeed, moderationHistory)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 10.2 Write property tests for MCP integration
    - **Property 23: MCP connection cap**
    - **Validates: Requirements 9.1**
    - **Property 24: Provider unavailability labeling**
    - **Validates: Requirements 9.4, 9.6**
    - **Property 25: MCP connect/disconnect preserves session state**
    - **Validates: Requirements 9.5**
    - **Property 26: No-data provider status**
    - **Validates: Requirements 9.7**

- [x] 11. Implement UI Layer
  - [x] 11.1 Implement WorkspaceLayout with responsive three-panel layout
    - Create src/components/WorkspaceLayout.tsx implementing the three-panel layout
    - Render three panels simultaneously at viewport ≥1280px (each min 300px width)
    - Collapse to single-panel tabbed view at viewport <1280px with tab navigation
    - Apply MD3 design tokens via Tailwind utility classes
    - _Requirements: 8.1, 8.2, 8.5, 8.6_

  - [x] 11.2 Implement SpecDraftPanel (left panel)
    - Create src/components/SpecDraftPanel.tsx displaying the current Spec Draft
    - Show streaming indicator while generation is in-progress
    - Render all 5 sections as formatted markdown content
    - Display error indicator on generation failure with retry capability
    - _Requirements: 1.4, 1.5_

  - [x] 11.3 Implement ActivityFeedPanel (center panel)
    - Create src/components/ActivityFeedPanel.tsx rendering chronological entries
    - Display contributor identity with color coding and avatar (distinct per role)
    - Render moderation controls (Accept, Reject, Edit) on completed Mitigations
    - Show chaos round banner during chaos analysis
    - Display connection status indicator on live connection loss
    - Show error entries with Error Container styling (#FFDAD6 background, #93000A text)
    - Auto-scroll for new entries without disrupting user scroll position
    - Render empty state message when no entries exist
    - _Requirements: 2.4, 2.6, 2.7, 3.4, 4.1, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 11.4 Implement ArtifactsPanel (right panel)
    - Create src/components/ArtifactsPanel.tsx displaying generated artifacts
    - Render each artifact as formatted markdown with full scrolling
    - Implement version selector dropdown for versioned artifacts
    - Show export errors per-file with "Retry Export" action
    - _Requirements: 6.8, 6.9, 7.3_

  - [x] 11.5 Implement Toolbar with action buttons
    - Create src/components/Toolbar.tsx with action buttons: "Simulate Chaos", "Finalize Spec"
    - Implement MCP connection status indicators showing active providers and their status
    - Disable "Finalize Spec" when no accepted Mitigations exist
    - Disable submission control while generation is in-progress
    - _Requirements: 1.6, 8.3, 9.2_

  - [x] 11.6 Implement moderation UI controls
    - Create src/components/ModerationControls.tsx with Accept, Reject, Edit buttons per Mitigation
    - Implement rejection reason input (1–1000 chars) with validation
    - Implement edit field (up to 5000 chars) with confirmation flow
    - Implement cancel behavior: discard input, return to initial state
    - Show conflict notification when targeting an already-modified section
    - Render equal card dimensions, padding, border treatment for all contributor roles
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 8.4_

  - [x] 11.7 Write property test for responsive layout
    - **Property 22: Responsive layout breakpoint**
    - **Validates: Requirements 8.5, 8.6**
    - Verify three-panel rendering at ≥1280px, single-panel tabbed view at <1280px

- [x] 12. Wire everything together
  - [x] 12.1 Implement Zustand global store and event system
    - Create src/core/store.ts with Zustand store managing full Session state
    - Implement WorkspaceEvent dispatch and subscription for real-time updates
    - Connect Session Manager auto-persistence on state changes
    - Wire Activity Feed updates to trigger within 2 seconds of events
    - _Requirements: 5.3, 7.1_

  - [x] 12.2 Integrate all components into main App
    - Create src/App.tsx wiring WorkspaceLayout with all panels and toolbar
    - Connect idea submission → SpecDraft generation → Red Team → Architect pipeline
    - Connect moderation actions to store updates and Activity Feed entries
    - Connect MCP client to agent context injection
    - Connect artifact generation and filesystem export on "Finalize Spec"
    - Wire error handling: field-level validation errors, feed-level agent errors, banner-level persistence errors
    - _Requirements: All (integration)_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 28 universal correctness properties defined in the design
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementation tasks use TypeScript
- Tailwind CSS must use the MD3 design token configuration from the workspace steering rules
- All AI streaming uses OpenAI-compatible API with AsyncGenerator pattern
- IndexedDB is the persistence layer — no server dependency for MVP

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "3.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.2", "3.3"] },
    { "id": 4, "tasks": ["2.4", "3.4", "6.1"] },
    { "id": 5, "tasks": ["5.1", "6.2"] },
    { "id": 6, "tasks": ["5.2", "6.3", "7.1", "7.3"] },
    { "id": 7, "tasks": ["7.2", "7.4", "9.1"] },
    { "id": 8, "tasks": ["9.2", "10.1"] },
    { "id": 9, "tasks": ["9.3", "10.2", "11.1"] },
    { "id": 10, "tasks": ["11.2", "11.3", "11.4", "11.5"] },
    { "id": 11, "tasks": ["11.6", "11.7"] },
    { "id": 12, "tasks": ["12.1"] },
    { "id": 13, "tasks": ["12.2"] }
  ]
}
```
