import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import { WorkspaceLayout } from '../../src/components/WorkspaceLayout.tsx';
import { arbViewportWidth } from '../generators.ts';
import { PBT_NUM_RUNS } from '../setup.ts';

describe('Feature: spec-collider, Property 22: Responsive layout breakpoint', () => {
  /**
   * Validates: Requirements 8.5, 8.6
   *
   * For any viewport width, if the width is 1280 pixels or above, the workspace
   * SHALL render three simultaneous panels each with a minimum width of 300 pixels;
   * if the width is below 1280 pixels, the workspace SHALL render a single-panel
   * tabbed view.
   */

  it('renders three panels with min-w-[300px] and no tablist at viewportWidth >= 1280', () => {
    fc.assert(
      fc.property(
        arbViewportWidth().filter((w) => w >= 1280),
        (viewportWidth) => {
          const { unmount } = render(
            <WorkspaceLayout sessionId="test-session" viewportWidth={viewportWidth} />
          );

          // Three panels should be rendered simultaneously
          const panels = screen.getAllByRole('region');
          expect(panels).toHaveLength(3);

          // Each panel should have min-w-[300px] class
          for (const panel of panels) {
            expect(panel.className).toContain('min-w-[300px]');
          }

          // No tablist should be present in wide viewport
          expect(screen.queryByRole('tablist')).toBeNull();

          unmount();
        }
      ),
      { numRuns: PBT_NUM_RUNS }
    );
  }, 15000);

  it('renders a tablist with single visible panel at viewportWidth < 1280', () => {
    fc.assert(
      fc.property(
        arbViewportWidth().filter((w) => w < 1280),
        (viewportWidth) => {
          const { unmount } = render(
            <WorkspaceLayout sessionId="test-session" viewportWidth={viewportWidth} />
          );

          // A tablist should be rendered for navigation
          const tablist = screen.getByRole('tablist');
          expect(tablist).toBeInTheDocument();

          // Only one tabpanel (single panel) should be visible at a time
          const tabpanels = screen.getAllByRole('tabpanel');
          expect(tabpanels).toHaveLength(1);

          unmount();
        }
      ),
      { numRuns: PBT_NUM_RUNS }
    );
  }, 15000);
});
