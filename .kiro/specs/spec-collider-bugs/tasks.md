# Implementation Plan: Spec Collider Bugs

## Overview

Fix two bugs in the Spec Collider application: (1) ArtifactsPanel renders markdown content via `react-markdown` instead of displaying it as preformatted text, stripping raw syntax characters; (2) Orchestrator's streaming response fallback throws TypeError when `response.body` is null and `response.text` is not available as a function. The fix for Bug 1 replaces `<Markdown>` with `<pre>`, and the fix for Bug 2 adds a `typeof` guard before calling `response.text()`.

## Tasks

- [x] 1. Write bug condition exploration tests
  - [x] 1.1 Write ArtifactsPanel exploration tests confirming markdown interpretation bug
    - Create test file `tests/unit/artifacts-panel-bugfix.test.tsx`
    - Write test rendering ArtifactsPanel with content `# Hello` and assert `#` character is present in rendered text content (will fail on unfixed code since Markdown strips it)
    - Write test rendering with `**bold** and _italic_` and assert `**` and `_` are in the rendered output (will fail on unfixed code)
    - _Requirements: 1.1, 2.1_

  - [x] 1.2 Write Orchestrator exploration tests confirming null body TypeError bug
    - Create test file `tests/unit/orchestrator-nullbody-bugfix.test.ts`
    - Write test mocking fetch to return `{ ok: true, body: null, headers: new Headers() }` (no text property) and call `invokeRedTeam` — assert error message is `'Response body is null'` (will fail with TypeError on unfixed code)
    - Write test mocking fetch to return `{ ok: true, body: null, text: undefined, headers: new Headers() }` — assert the same clear error (will fail on unfixed code)
    - _Requirements: 1.2, 2.2_

- [x] 2. Fix ArtifactsPanel markdown rendering bug
  - [x] 2.1 Replace Markdown component with preformatted text element
    - Remove `import Markdown from 'react-markdown'` import from `src/components/ArtifactsPanel.tsx`
    - Replace `<Markdown>{displayVersion?.content ?? ''}</Markdown>` with `<pre className="whitespace-pre-wrap break-words">{displayVersion?.content ?? ''}</pre>`
    - Remove `prose prose-sm max-w-none` classes from the parent content container div
    - Verify `overflow-y-auto` class remains on content container for scrolling
    - _Requirements: 2.1, 3.1, 3.2_

- [x] 3. Fix orchestrator null response body error
  - [x] 3.1 Add type guard for response.text before fallback call
    - In `src/agents/orchestrator.ts`, inside the `if (!response.body)` branch of the `invokeAgent` method, add `if (typeof response.text !== 'function') { throw new Error('Response body is null'); }` as the first statement
    - Ensure the existing `await response.text()` fallback logic remains unchanged when `response.text` IS a function
    - _Requirements: 2.2, 3.3, 3.4, 3.5_

- [x] 4. Run full test suite to verify fixes and no regressions
  - [x] 4.1 Execute all tests and confirm results
    - Run `npm test` to execute all unit and property tests
    - Verify the 2 previously failing tests now pass
    - Verify all previously passing tests continue to pass (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

## Notes

- Bug 1 root cause: `react-markdown` interprets markdown syntax and renders as HTML elements, stripping raw characters from visible text
- Bug 2 root cause: missing `typeof` guard before calling `response.text()` when `response.body` is null
- Task 1 exploration tests are expected to FAIL on unfixed code — this confirms the bugs exist
- Tasks 2 and 3 apply the minimal targeted fixes described in the design document
- Task 4 verifies both fixes work and no regressions are introduced

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["4.1"] }
  ]
}
```
