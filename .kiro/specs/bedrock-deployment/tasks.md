# Implementation Plan: Bedrock Deployment

## Overview

Replace the OpenAI-compatible streaming backend with Amazon Bedrock ConverseStream API fronted by a Lambda proxy. Deploy the frontend React SPA to CloudFront + S3, define all infrastructure in a single AWS CDK (TypeScript) stack, and adapt the existing `AgentOrchestrator` to call the new endpoint while preserving the `AsyncGenerator<StreamChunk>` interface.

## Tasks

- [x] 1. Set up infrastructure project structure
  - [x] 1.1 Create infra directory with CDK scaffolding
    - Create `infra/` directory with `bin/app.ts`, `lib/bedrock-stack.ts` (empty class), `cdk.json`, `tsconfig.json`, and `package.json`
    - `package.json` should include `aws-cdk-lib`, `constructs`, `@aws-sdk/client-bedrock-runtime`, `@types/aws-lambda`, and `aws-cdk-lib/aws-lambda-nodejs` dependencies
    - `cdk.json` should point to `bin/app.ts` as the app entry
    - _Requirements: 6.1, 6.4_

  - [x] 1.2 Create Lambda handler source files with type stubs
    - Create `infra/lambda/handler.ts` with an exported `handler` function stub returning 200
    - Create `infra/lambda/sse.ts` with `formatSSEChunk` and `parseSSEChunk` function stubs
    - Create `infra/lambda/message-mapper.ts` with `mapToBedrockMessages` function stub
    - _Requirements: 1.5, 1.6_

- [x] 2. Implement SSE utilities and message mapper
  - [x] 2.1 Implement SSE formatting and parsing (`infra/lambda/sse.ts`)
    - `formatSSEChunk(content: string, done: boolean): string` — returns `data: {"content":"<text>","done":<bool>}\n\n`
    - `parseSSEChunk(raw: string): SSEPayload | null` — parses SSE data lines, handles `[DONE]` sentinel, returns null for malformed input
    - Export `SSEPayload` interface `{ content: string; done: boolean }`
    - _Requirements: 1.2, 1.3_

  - [x] 2.2 Write property test for SSE round-trip
    - **Property 1: SSE round-trip preserves content**
    - For any arbitrary string and boolean, `parseSSEChunk(formatSSEChunk(content, done))` returns `{ content, done }`
    - Use `fast-check` with `fc.string()` and `fc.boolean()` arbitraries
    - Place test in `tests/properties/sse.prop.ts`
    - **Validates: Requirements 1.2, 2.3**

  - [x] 2.3 Implement message mapper (`infra/lambda/message-mapper.ts`)
    - `mapToBedrockMessages(messages: FrontendMessage[]): Message[]` — maps `{ role, content }` to `{ role, content: [{ text }] }`
    - Define `FrontendMessage` interface locally
    - Import `Message` type from `@aws-sdk/client-bedrock-runtime`
    - _Requirements: 7.1, 7.2_

  - [x] 2.4 Write property test for message mapping
    - **Property 4: Message mapping to Bedrock format**
    - For any non-empty array of `{ role, content }` objects, output array has equal length with each element's `content` equal to `[{ text: inputContent }]`
    - Use `fast-check` with `fc.array(fc.record({ role: fc.constantFrom('user','assistant'), content: fc.string() }), { minLength: 1 })`
    - Place test in `tests/properties/message-mapper.prop.ts`
    - **Validates: Requirements 7.1, 7.2**

- [x] 3. Implement Lambda proxy handler
  - [x] 3.1 Implement request validation and error handling (`infra/lambda/handler.ts`)
    - Parse `event.body` as JSON; if missing `messages` or `messages` is not an array, return 400 with `{ "error": "messages field is required and must be an array" }`
    - Set response headers: `Content-Type: application/json` for errors
    - _Requirements: 7.5, 1.4_

  - [x] 3.2 Write property test for invalid payload rejection
    - **Property 5: Invalid payload rejection**
    - For any request body missing `messages` or with `messages` not an array, handler returns 400 with the exact error JSON
    - Use `fast-check` with `fc.oneof(fc.record({ system: fc.string() }), fc.record({ messages: fc.anything().filter(m => !Array.isArray(m)) }))`
    - Place test in `tests/properties/lambda-handler.prop.ts`
    - **Validates: Requirements 7.5**

  - [x] 3.3 Implement Bedrock ConverseStream invocation and SSE streaming
    - Instantiate `BedrockRuntimeClient` at module level
    - Read `BEDROCK_MODEL_ID` from `process.env` with fallback to `us.amazon.nova-2-lite-v1:0`
    - Map messages via `mapToBedrockMessages`, wrap system prompt as `[{ text: system }]`
    - Send `ConverseStreamCommand`, iterate over `response.stream`, collect SSE chunks via `formatSSEChunk`
    - Append final `formatSSEChunk('', true)` done event
    - Return 200 with `Content-Type: text/event-stream` and `Cache-Control: no-cache`
    - On error, return 500 with JSON `{ error: message }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.3, 7.4_

  - [x] 3.4 Write property test for error response well-formedness
    - **Property 2: Error responses are well-formed**
    - Mock `BedrockRuntimeClient.send` to throw an error with any message string; verify handler returns non-2xx status and JSON body with non-empty `error` string
    - Place test in `tests/properties/lambda-handler.prop.ts`
    - **Validates: Requirements 1.4**

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement CDK stack
  - [x] 5.1 Define S3 bucket and CloudFront distribution
    - Create private S3 bucket with `BlockPublicAccess.BLOCK_ALL`, `RemovalPolicy.DESTROY`, `autoDeleteObjects: true`
    - Create CloudFront distribution with S3 origin using `S3BucketOrigin.withOriginAccessControl`
    - Set `defaultRootObject: 'index.html'`
    - Add custom error responses for 403/404 → `/index.html` with 200 (SPA client-side routing)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.2 Define Lambda function and IAM permissions
    - Create `NodejsFunction` with `Runtime.NODEJS_20_X`, entry pointing to `../lambda/handler.ts`, handler `'handler'`
    - Set environment variable `BEDROCK_MODEL_ID` to `us.amazon.nova-2-lite-v1:0`
    - Set timeout to 60s, memory to 256MB
    - Add IAM policy statement: action `bedrock:InvokeModelWithResponseStream`, resource ARN scoped to model `us.amazon.nova-2-lite-v1:0` in deployment region
    - No Lambda layers
    - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.5, 5.6, 6.2, 6.3_

  - [x] 5.3 Define HTTP API Gateway with CORS and route
    - Create `HttpApi` with CORS preflight: allowed origins `https://${distribution.distributionDomainName}` and `http://localhost:*`, methods POST/OPTIONS, headers `Content-Type`
    - Add POST `/converse` route with `HttpLambdaIntegration`
    - No authentication on the route
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 5.4 Add S3 deployment and CDK outputs
    - Add `BucketDeployment` sourcing from `../../dist` to the S3 bucket, with CloudFront invalidation on `['/*']`
    - Add `CfnOutput` for distribution URL and API endpoint
    - _Requirements: 4.2, 6.1_

  - [x] 5.5 Create CDK app entry point (`infra/bin/app.ts`)
    - Instantiate `cdk.App`, create `BedrockStack` instance
    - _Requirements: 6.1_

- [x] 6. Adapt frontend orchestrator
  - [x] 6.1 Update `AgentOrchestratorConfig` interface (`src/agents/orchestrator.ts`)
    - Replace `apiKey`, `baseUrl`, `model` fields with single `endpointUrl: string`
    - Keep `redTeamSystemPrompt`, `architectSystemPrompt`, `timeoutMs`
    - _Requirements: 2.1, 2.4_

  - [x] 6.2 Update `invokeAgent` to call Lambda endpoint
    - Change fetch URL from `${baseUrl}/chat/completions` to `${endpointUrl}`
    - Remove `Authorization` header and `model`/`stream` fields from request body
    - Send `{ messages: [{ role, content }], system: systemPrompt }` as the request body
    - Keep SSE parsing logic (already compatible with `data: {"content":"...","done":...}\n\n` format)
    - Parse response chunks using the existing `data: ` prefix extraction and JSON parse
    - Adjust parsed content extraction from `choices[0].delta.content` to direct `content` field from SSE payload
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 6.3 Update error handling for non-2xx responses
    - On non-2xx response, read response body as JSON, throw Error with status code and error message
    - _Requirements: 2.5_

  - [x] 6.4 Write property test for non-2xx status propagation
    - **Property 3: Non-2xx status propagation**
    - For any HTTP status outside 200-299 and any error message string, `AgentOrchestrator` throws an Error whose message includes both the numeric status and the error text
    - Mock `fetch` to return the given status and JSON body
    - Place test in `tests/properties/orchestrator-error.prop.ts`
    - **Validates: Requirements 2.5**

- [x] 7. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The CDK stack uses `NodejsFunction` for bundling — no Lambda layers or external packaging tools
- Frontend SSE parsing logic is largely preserved; only the request shape and content extraction change

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.3"] },
    { "id": 3, "tasks": ["2.2", "2.4", "3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3"] },
    { "id": 5, "tasks": ["3.4", "5.1", "5.5"] },
    { "id": 6, "tasks": ["5.2", "5.3"] },
    { "id": 7, "tasks": ["5.4", "6.1"] },
    { "id": 8, "tasks": ["6.2"] },
    { "id": 9, "tasks": ["6.3"] },
    { "id": 10, "tasks": ["6.4"] }
  ]
}
```
