import { useState } from 'react';

export interface WorkspaceLayoutProps {
  sessionId: string;
  viewportWidth: number;
  children?: {
    specDraft?: React.ReactNode;
    activityFeed?: React.ReactNode;
    artifacts?: React.ReactNode;
  };
}

const BREAKPOINT = 1280;

type TabId = 'spec-draft' | 'activity-feed' | 'artifacts';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'spec-draft', label: 'Spec Draft' },
  { id: 'activity-feed', label: 'Activity Feed' },
  { id: 'artifacts', label: 'Artifacts' },
];

/**
 * WorkspaceLayout implements the three-panel responsive workspace.
 *
 * - At viewport ≥1280px: renders all three panels side-by-side (each min 300px).
 * - At viewport <1280px: renders a single-panel tabbed view with tab navigation.
 *
 * Uses MD3 design tokens via Tailwind utility classes.
 */
export function WorkspaceLayout({ sessionId, viewportWidth, children }: WorkspaceLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>('spec-draft');
  const isWideViewport = viewportWidth >= BREAKPOINT;

  const specDraftContent = children?.specDraft ?? (
    <div className="p-4 text-surface-on-variant">Spec Draft panel</div>
  );
  const activityFeedContent = children?.activityFeed ?? (
    <div className="p-4 text-surface-on-variant">Activity Feed panel</div>
  );
  const artifactsContent = children?.artifacts ?? (
    <div className="p-4 text-surface-on-variant">Artifacts panel</div>
  );

  if (isWideViewport) {
    return (
      <div
        className="flex h-full w-full bg-background"
        data-session-id={sessionId}
        data-testid="workspace-layout"
      >
        <section
          className="min-w-[300px] flex-1 overflow-y-auto border-r border-outline-variant bg-surface"
          aria-label="Spec Draft"
          data-testid="panel-spec-draft"
        >
          {specDraftContent}
        </section>
        <section
          className="min-w-[300px] flex-1 overflow-y-auto border-r border-outline-variant bg-surface-container"
          aria-label="Activity Feed"
          data-testid="panel-activity-feed"
        >
          {activityFeedContent}
        </section>
        <section
          className="min-w-[300px] flex-1 overflow-y-auto bg-surface"
          aria-label="Artifacts"
          data-testid="panel-artifacts"
        >
          {artifactsContent}
        </section>
      </div>
    );
  }

  // Tabbed single-panel view for narrow viewports
  const activeContent =
    activeTab === 'spec-draft'
      ? specDraftContent
      : activeTab === 'activity-feed'
        ? activityFeedContent
        : artifactsContent;

  return (
    <div
      className="flex h-full w-full flex-col bg-background"
      data-session-id={sessionId}
      data-testid="workspace-layout"
    >
      <nav
        className="flex border-b border-outline-variant bg-surface-container"
        role="tablist"
        aria-label="Workspace panels"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-surface-on-variant hover:text-surface-on hover:bg-surface-container-high'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="flex-1 overflow-y-auto bg-surface"
        data-testid={`panel-${activeTab}`}
      >
        {activeContent}
      </div>
    </div>
  );
}
