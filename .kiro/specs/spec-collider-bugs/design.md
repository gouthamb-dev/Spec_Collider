# Spec Collider Bugs - Bugfix Design

## Overview

This design addresses two bugs in the Spec Collider application:

1. **ArtifactsPanel Markdown Rendering**: The `ArtifactsPanel` component uses `react-markdown` to render artifact content, which interprets markdown syntax and strips raw characters (e.g., `# Hello` becomes an `<h1>` element). The fix replaces the `<Markdown>` component with a `<pre>` element to preserve raw content exactly as authored.

2. **Orchestrator Null Response Body**: The orchestrator's streaming response fallback does not guard against `response.text` being unavailable. When `response.body` is null and `response.text` is not a function, a TypeError is thrown instead of a descriptive `Error('Response body is null')`. The fix adds a `typeof` check before calling `response.text()`.

## Glossary

- **Bug_Condition (C)**: The condition(s) that trigger the bug — markdown content being interpreted in ArtifactsPanel, and null body without text fallback in orchestrator
- **Property (P)**: The desired correct behavior — raw content preserved as preformatted text, and explicit error thrown for null body
- **Preservation**: Existing behaviors that must remain unchanged — scrolling, version selection, streaming, text fallback, and error handling
- **ArtifactsPanel**: The React component in `src/components/ArtifactsPanel.tsx` that renders generated spec artifacts
- **AgentOrchestrator**: The class in `src/agents/orchestrator.ts` that invokes AI agents with streaming SSE responses
- **SSE**: Server-Sent Events — the streaming protocol used for agent responses

## Bug Details

### Bug Condition

The two bugs manifest independently:

**Bug 1** manifests when artifact content containing any markdown syntax characters (`#`, `*`, `-`, `>`, etc.) is displayed in the ArtifactsPanel. The `<Markdown>` component from `react-markdown` interprets these characters as formatting directives and renders them as HTML elements, removing the raw characters from visible text content.

**Bug 2** manifests when a fetch response has `response.body === null` and the response object does not provide a `text` method (i.e., `typeof response.text !== 'function'`). The current code unconditionally calls `await response.text()`, which throws `TypeError: response.text is not a function` instead of a clear `Error('Response body is null')`.

**Formal Specification:**

```
FUNCTION isBugCondition_Bug1(input)
  INPUT: input of type { content: string, renderMethod: 'markdown' | 'pre' }
  OUTPUT: boolean
  
  RETURN input.renderMethod = 'markdown'
         AND input.content CONTAINS markdown_syntax_characters
         AND rendered_output STRIPS raw characters from visible text
END FUNCTION

FUNCTION isBugCondition_Bug2(input)
  INPUT: input of type FetchResponse
  OUTPUT: boolean
  
  RETURN input.body = null
         AND typeof(input.text) != 'function'
END FUNCTION
```

### Examples

- **Bug 1 Example 1**: Content `# Hello World` is rendered as `<h1>Hello World</h1>` — the `#` and space are stripped from visible text. Expected: display `# Hello World` literally.
- **Bug 1 Example 2**: Content `**bold text**` is rendered as `<strong>bold text</strong>` — the `**` markers are stripped. Expected: display `**bold text**` literally.
- **Bug 1 Example 3**: Content `- list item` is rendered as `<ul><li>list item</li></ul>` — the `-` is stripped. Expected: display `- list item` literally.
- **Bug 2 Example 1**: Response with `{ ok: true, body: null }` (no `text` property) throws `TypeError: response.text is not a function`. Expected: throws `Error('Response body is null')`.
- **Bug 2 Example 2**: Response with `{ ok: true, body: null, text: () => Promise.resolve('data: ...') }` should still use `response.text()` fallback successfully (not a bug case).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Scrollable overflow container with `overflow-y-auto` class in ArtifactsPanel content area must continue to work
- Version selection based on `selectedVersion` or `currentVersion` must continue to display correct content
- Artifact card layout, headings, and version dropdown must remain visually unchanged
- Normal streaming via `response.body.getReader()` must continue to parse SSE data lines
- Text fallback via `response.text()` must continue to work when `response.body` is null AND `response.text` IS a function
- Non-ok response error handling (`API error: {status} {message}`) must remain unchanged
- Timeout handling via `AbortController` must remain unchanged
- Context isolation (system prompt separation) must remain unchanged

**Scope:**
All inputs that do NOT match the bug conditions should be completely unaffected by these fixes. This includes:
- Artifact content display layout, styling, and scrolling behavior
- Empty state rendering when no artifacts exist
- Export error banner display
- All streaming responses with valid `response.body`
- All responses where `response.text` is available as a fallback
- All non-ok HTTP responses (error handling path)
- Timeout and abort handling

## Hypothesized Root Cause

Based on the bug descriptions and code analysis:

### Bug 1: ArtifactsPanel

1. **Incorrect Component Choice**: The `<Markdown>` component from `react-markdown` was used to render artifact content. This component is designed to parse and render markdown as HTML, which is the opposite of what's needed — the content should be displayed as raw preformatted text.
   - Line: `<Markdown>{displayVersion?.content ?? ''}</Markdown>` in ArtifactsPanel.tsx
   - The import `import Markdown from 'react-markdown'` is the root cause dependency

### Bug 2: Orchestrator

1. **Missing Type Guard**: The `if (!response.body)` branch immediately calls `await response.text()` without checking whether `response.text` is actually a callable function.
   - In environments or mocks where `response.body` is null, the `text` property may also be undefined/absent
   - The code assumes the `Response` object always has a `text()` method, which is not guaranteed in all runtime contexts or test mocks

## Correctness Properties

Property 1: Bug Condition - ArtifactsPanel Preserves Raw Content

_For any_ artifact content containing markdown syntax characters (where isBugCondition_Bug1 returns true), the fixed ArtifactsPanel component SHALL render the content inside a `<pre>` element, preserving all raw characters exactly as authored without any markdown interpretation.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Orchestrator Throws Clear Error on Null Body

_For any_ fetch response where `response.body` is null AND `typeof response.text !== 'function'` (where isBugCondition_Bug2 returns true), the fixed orchestrator SHALL throw an `Error` with message `'Response body is null'` instead of a TypeError.

**Validates: Requirements 2.2**

Property 3: Preservation - ArtifactsPanel Layout and Behavior

_For any_ input where the bug condition does NOT hold (non-markdown-related rendering aspects), the fixed ArtifactsPanel SHALL produce the same layout behavior as the original — including scrollable overflow, version selection, artifact card structure, and empty state rendering.

**Validates: Requirements 3.1, 3.2**

Property 4: Preservation - Orchestrator Streaming and Fallback

_For any_ response where the bug condition does NOT hold (valid body streaming, text fallback available, non-ok errors, timeouts), the fixed orchestrator SHALL produce exactly the same behavior as the original function, preserving all existing streaming, error handling, and context isolation behavior.

**Validates: Requirements 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

**File**: `src/components/ArtifactsPanel.tsx`

**Specific Changes**:
1. **Remove react-markdown import**: Delete `import Markdown from 'react-markdown'` since the dependency is no longer needed
2. **Replace Markdown component with pre element**: Change `<Markdown>{displayVersion?.content ?? ''}</Markdown>` to `<pre>{displayVersion?.content ?? ''}</pre>`
3. **Adjust styling**: Remove `prose prose-sm max-w-none` classes from the content container (these are typography classes for rendered markdown). Add appropriate styles for preformatted text display (e.g., `whitespace-pre-wrap` for line wrapping within the container)

---

**File**: `src/agents/orchestrator.ts`

**Function**: `invokeAgent` (private method)

**Specific Changes**:
1. **Add type guard for response.text**: Before calling `response.text()`, check `typeof response.text !== 'function'`
2. **Throw descriptive error**: If `response.text` is not a function, throw `new Error('Response body is null')` immediately
3. **Preserve existing text fallback**: If `response.text` IS a function, continue with the existing `await response.text()` and SSE parsing logic

**Updated code structure**:
```typescript
if (!response.body) {
  if (typeof response.text !== 'function') {
    throw new Error('Response body is null');
  }
  // Existing text fallback logic continues here...
  const text = await response.text();
  // ... parse SSE lines from text ...
}
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that render ArtifactsPanel with markdown content and assert raw characters are preserved. Write tests that mock a response with null body and no text method, asserting the correct error is thrown. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Markdown Content Preservation Test**: Render ArtifactsPanel with content `# Hello` and assert the rendered text contains `#` (will fail on unfixed code — Markdown strips it)
2. **Multiple Syntax Test**: Render with `**bold** and _italic_` and assert `**` and `_` are in the output (will fail on unfixed code)
3. **Null Body Without Text Test**: Mock response with `{ ok: true, body: null }` (no text property) and assert error message is `'Response body is null'` (will fail on unfixed code with TypeError)
4. **Null Body Type Check Test**: Mock response with `{ ok: true, body: null, text: undefined }` and assert the same clear error (will fail on unfixed code)

**Expected Counterexamples**:
- ArtifactsPanel renders `# Hello` without the `#` character visible in text content
- Orchestrator throws `TypeError: response.text is not a function` instead of `Error('Response body is null')`
- Possible causes confirmed: wrong render component, missing type guard

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
// Bug 1 Fix Check
FOR ALL content WHERE content CONTAINS markdown_syntax DO
  rendered := ArtifactsPanel'({ content })
  ASSERT rendered.textContent CONTAINS all raw characters from content
  ASSERT rendered uses <pre> element (not <Markdown>)
END FOR

// Bug 2 Fix Check
FOR ALL response WHERE response.body = null AND typeof(response.text) != 'function' DO
  error := invokeRedTeam'(response)
  ASSERT error.message = 'Response body is null'
  ASSERT error IS instanceof Error (not TypeError)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
// Bug 1 Preservation
FOR ALL props WHERE props represent non-content-rendering aspects DO
  ASSERT ArtifactsPanel(props).layout = ArtifactsPanel'(props).layout
  ASSERT ArtifactsPanel(props).scrollBehavior = ArtifactsPanel'(props).scrollBehavior
  ASSERT ArtifactsPanel(props).versionSelection = ArtifactsPanel'(props).versionSelection
END FOR

// Bug 2 Preservation
FOR ALL response WHERE response.body != null OR typeof(response.text) = 'function' DO
  ASSERT invokeRedTeam(response) = invokeRedTeam'(response)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for normal streaming, text fallback, and component rendering, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Streaming Preservation**: Verify that valid `response.body` streams continue to yield correct `StreamChunk` objects after fix
2. **Text Fallback Preservation**: Verify that `response.body = null` with `response.text` as a function continues to parse SSE lines correctly
3. **Error Handling Preservation**: Verify that non-ok responses continue to throw `API error: {status} {message}`
4. **Layout Preservation**: Verify ArtifactsPanel empty state, version dropdown, and scrolling behavior remain unchanged

### Unit Tests

- Test ArtifactsPanel renders content inside `<pre>` element with raw characters preserved
- Test ArtifactsPanel preserves all markdown syntax characters (`#`, `*`, `-`, `>`, `` ` ``, `[]()`)
- Test orchestrator throws `Error('Response body is null')` when body is null and text is not a function
- Test orchestrator still uses `response.text()` fallback when body is null but text IS a function
- Test edge cases: empty content string, content with only whitespace, response with text as non-function value

### Property-Based Tests

- Generate random strings containing markdown syntax and verify ArtifactsPanel preserves all characters in rendered output
- Generate random response configurations (null body, missing text, valid body) and verify correct error/success behavior
- Generate random artifact arrays and verify layout structure (cards, versions, scrolling) is consistent

### Integration Tests

- Test full artifact rendering flow: create versioned artifact with markdown content, render panel, verify raw display
- Test orchestrator end-to-end: mock various response shapes and verify streaming/fallback/error paths
- Test that existing passing tests (30 of 32) continue to pass after fix
