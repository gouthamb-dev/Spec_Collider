# Bugfix Requirements Document

## Introduction

This document captures two bugs in the Spec Collider application that cause unit test failures. Bug 1 involves the ArtifactsPanel rendering markdown content instead of displaying it as preformatted text, stripping raw syntax characters. Bug 2 involves the Orchestrator's streaming response fallback throwing an incorrect TypeError instead of a clear error when `response.body` is null and `response.text` is unavailable. Together, these account for 2 of 32 failing unit tests (30 pass currently).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN artifact content containing markdown syntax (e.g., `# Hello`) is displayed in the ArtifactsPanel THEN the system renders it as HTML (converting `# Hello` into an `<h1>` element), stripping the raw `#` character from the visible text content

1.2 WHEN a fetch response has `response.body` as null AND the response object does not have a `text` method (i.e., `typeof response.text !== 'function'`) THEN the system throws a TypeError "response.text is not a function" instead of a descriptive error

### Expected Behavior (Correct)

2.1 WHEN artifact content containing markdown syntax is displayed in the ArtifactsPanel THEN the system SHALL render it as preformatted text, preserving all raw characters (including `#`, `*`, `-`, etc.) exactly as authored

2.2 WHEN a fetch response has `response.body` as null AND `response.text` is not available as a function THEN the system SHALL throw an explicit `Error('Response body is null')` so callers can handle the null body condition clearly

### Unchanged Behavior (Regression Prevention)

3.1 WHEN artifact content is displayed in the ArtifactsPanel with scrollable overflow THEN the system SHALL CONTINUE TO render content inside a container with `overflow-y-auto` class for full scrolling support

3.2 WHEN artifact content is displayed for any artifact type (requirements, design, tasks, adr, steering_rules) THEN the system SHALL CONTINUE TO show the correct version content based on `selectedVersion` or `currentVersion`

3.3 WHEN a fetch response has a valid readable `response.body` (non-null) THEN the system SHALL CONTINUE TO stream and parse SSE data lines from the body using a TextDecoder reader loop

3.4 WHEN a fetch response has `response.body` as null AND `response.text` IS available as a function THEN the system SHALL CONTINUE TO use `response.text()` as the fallback to read and parse SSE lines from the full text response

3.5 WHEN a fetch response returns a non-ok status (e.g., 500) THEN the system SHALL CONTINUE TO throw an `Error` with the format "API error: {status} {message}"

---

## Bug Condition Derivation

### Bug 1: ArtifactsPanel Markdown Rendering

**Bug Condition Function:**

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ArtifactContent
  OUTPUT: boolean
  
  // Returns true when artifact content contains markdown syntax characters
  // that would be interpreted/stripped by a markdown renderer
  RETURN X.content CONTAINS markdown_syntax_characters
END FUNCTION
```

**Property Specification — Fix Checking:**

```pascal
// Property: Fix Checking - Preformatted Text Display
FOR ALL X WHERE isBugCondition(X) DO
  rendered ← ArtifactsPanel'(X)
  ASSERT rendered.textContent CONTAINS X.content.raw_characters
  ASSERT rendered.element IS <pre> (not <Markdown>)
END FOR
```

**Preservation Goal:**

```pascal
// Property: Preservation Checking - Scrolling and Version Selection
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT ArtifactsPanel(X) = ArtifactsPanel'(X)
  // Layout, scrolling, version selection remain unchanged
END FOR
```

### Bug 2: Orchestrator Null Response Body

**Bug Condition Function:**

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type FetchResponse
  OUTPUT: boolean
  
  // Returns true when body is null AND text method is not available
  RETURN X.body = null AND typeof(X.text) != 'function'
END FUNCTION
```

**Property Specification — Fix Checking:**

```pascal
// Property: Fix Checking - Clear Error on Null Body Without Text Fallback
FOR ALL X WHERE isBugCondition(X) DO
  error ← invokeRedTeam'(X)
  ASSERT error.message = 'Response body is null'
  ASSERT error IS instanceof Error (not TypeError)
END FOR
```

**Preservation Goal:**

```pascal
// Property: Preservation Checking - Existing Streaming and Fallback Behavior
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT invokeRedTeam(X) = invokeRedTeam'(X)
  // Normal streaming, text fallback, and error handling remain unchanged
END FOR
```
