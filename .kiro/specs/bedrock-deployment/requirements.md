# Requirements Document

## Introduction

This feature replaces the existing OpenAI-compatible streaming API backend with Amazon Bedrock ConverseStream API, fronted by an AWS Lambda proxy. The frontend React SPA is deployed to CloudFront + S3, and all infrastructure is defined as AWS CDK (TypeScript). The existing `AgentOrchestrator` streaming interface (`AsyncGenerator<StreamChunk>`) is preserved so the rest of the application remains untouched.

## Glossary

- **Lambda_Proxy**: An AWS Lambda function (Node.js 20.x runtime) that receives HTTP requests from the frontend, invokes the Amazon Bedrock ConverseStream API, and streams responses back to the client via chunked transfer encoding.
- **Bedrock_Client**: The AWS SDK v3 Bedrock Runtime client used within the Lambda_Proxy to call the ConverseStream API with model `us.amazon.nova-2-lite-v1:0`.
- **CDK_Stack**: An AWS CDK (TypeScript) stack that defines and provisions all infrastructure resources for the deployment.
- **HTTP_API_Gateway**: An Amazon API Gateway HTTP API that routes frontend requests to the Lambda_Proxy with CORS enabled and no authentication.
- **CloudFront_Distribution**: An Amazon CloudFront distribution that serves the frontend SPA from a private S3 bucket via Origin Access Control (OAC).
- **S3_Bucket**: A private Amazon S3 bucket configured with OAC that stores the built frontend assets.
- **OAC**: Origin Access Control, the mechanism by which CloudFront accesses the private S3_Bucket without making the bucket public.
- **Agent_Orchestrator**: The existing frontend service that streams AI responses as `AsyncGenerator<StreamChunk>` via fetch + SSE parsing.
- **StreamChunk**: The existing interface `{ content: string; done: boolean; source: AgentRole; timestamp: number }` used throughout the application for streaming data.
- **IAM_Role**: An AWS IAM role assigned to the Lambda_Proxy granting permission to invoke Bedrock model inference.

## Requirements

### Requirement 1: Lambda Proxy Bedrock Integration

**User Story:** As a developer, I want the Lambda proxy to call Amazon Bedrock ConverseStream API, so that the application uses a managed AWS AI service instead of direct OpenAI API calls.

#### Acceptance Criteria

1. WHEN the Lambda_Proxy receives a POST request with a messages payload, THE Lambda_Proxy SHALL invoke the Bedrock ConverseStream API using model ID `us.amazon.nova-2-lite-v1:0`.
2. WHILE the Bedrock_Client is streaming a response, THE Lambda_Proxy SHALL forward each content chunk to the client as a server-sent event in the format `data: {"content":"<text>","done":false}\n\n`.
3. WHEN the Bedrock_Client stream completes, THE Lambda_Proxy SHALL send a final event `data: {"content":"","done":true}\n\n` and close the connection.
4. IF the Bedrock_Client returns an error or the stream fails, THEN THE Lambda_Proxy SHALL respond with an appropriate HTTP error status and a JSON body containing an error message.
5. THE Lambda_Proxy SHALL use the AWS SDK v3 `BedrockRuntimeClient` and `ConverseStreamCommand` to invoke the model.
6. THE Lambda_Proxy SHALL run on Node.js 20.x runtime.

### Requirement 2: Frontend Orchestrator Adaptation

**User Story:** As a developer, I want the AgentOrchestrator to call the Lambda proxy endpoint instead of the OpenAI API, so that the frontend routes through the AWS infrastructure while maintaining the existing streaming interface.

#### Acceptance Criteria

1. THE Agent_Orchestrator SHALL send streaming requests to the HTTP_API_Gateway endpoint URL instead of the OpenAI base URL.
2. THE Agent_Orchestrator SHALL continue to yield `StreamChunk` objects from an `AsyncGenerator<StreamChunk>` for each agent invocation.
3. WHEN the Agent_Orchestrator receives SSE chunks from the Lambda_Proxy, THE Agent_Orchestrator SHALL parse each chunk and yield a StreamChunk with the content, done flag, source role, and current timestamp.
4. THE Agent_Orchestrator SHALL preserve the existing `invokeRedTeam`, `invokeArchitect`, and `invokeChaos` method signatures without modification.
5. IF the HTTP_API_Gateway returns a non-2xx response, THEN THE Agent_Orchestrator SHALL throw an error with the HTTP status and response message.

### Requirement 3: IAM Permissions

**User Story:** As a developer, I want the Lambda function to have precisely scoped IAM permissions, so that it can invoke Bedrock model inference without over-privileged access.

#### Acceptance Criteria

1. THE IAM_Role SHALL grant the `bedrock:InvokeModelWithResponseStream` permission to the Lambda_Proxy.
2. THE IAM_Role SHALL scope the resource ARN to the specific model `us.amazon.nova-2-lite-v1:0` in the deployment region.
3. THE IAM_Role SHALL grant no other Bedrock permissions beyond `bedrock:InvokeModelWithResponseStream`.

### Requirement 4: CDK Stack — S3 and CloudFront

**User Story:** As a developer, I want the frontend deployed to CloudFront + S3 via CDK, so that the SPA is served globally with low latency from a private bucket.

#### Acceptance Criteria

1. THE CDK_Stack SHALL create an S3_Bucket with public access blocked (all four block public access settings enabled).
2. THE CDK_Stack SHALL create a CloudFront_Distribution with the S3_Bucket as its origin using OAC.
3. THE S3_Bucket SHALL have a bucket policy that allows access only from the CloudFront_Distribution via OAC.
4. THE CloudFront_Distribution SHALL configure a default root object of `index.html`.
5. WHEN a request path does not match an S3 object, THE CloudFront_Distribution SHALL return `index.html` with HTTP 200 to support client-side routing.

### Requirement 5: CDK Stack — Lambda and API Gateway

**User Story:** As a developer, I want the Lambda proxy and HTTP API Gateway defined in CDK, so that the backend infrastructure is reproducible and version-controlled.

#### Acceptance Criteria

1. THE CDK_Stack SHALL create a Lambda function with Node.js 20.x runtime and the Lambda_Proxy handler code bundled from the project source.
2. THE CDK_Stack SHALL create an HTTP_API_Gateway with a POST route that integrates with the Lambda function.
3. THE HTTP_API_Gateway SHALL enable CORS with allowed origins set to the CloudFront_Distribution domain and `http://localhost:*` for local development.
4. THE HTTP_API_Gateway SHALL have no authentication or authorization configured on the route (public endpoint).
5. THE CDK_Stack SHALL attach the IAM_Role with Bedrock permissions to the Lambda function.
6. THE Lambda function SHALL have the Bedrock model ID configured via an environment variable named `BEDROCK_MODEL_ID`.

### Requirement 6: CDK Stack — Minimal Architecture

**User Story:** As a developer, I want the CDK stack to remain lightweight with minimal layers, so that the deployment is simple to understand and maintain.

#### Acceptance Criteria

1. THE CDK_Stack SHALL define all resources in a single stack (S3_Bucket, CloudFront_Distribution, Lambda function, HTTP_API_Gateway, IAM_Role).
2. THE CDK_Stack SHALL use no Lambda layers.
3. THE CDK_Stack SHALL bundle the Lambda handler code using CDK NodejsFunction or equivalent inline bundling without external packaging tools.
4. THE CDK_Stack SHALL be written in TypeScript.

### Requirement 7: Request Payload Contract

**User Story:** As a developer, I want a clear request/response contract between the frontend and Lambda proxy, so that both sides can be developed and tested independently.

#### Acceptance Criteria

1. THE Lambda_Proxy SHALL accept a JSON request body with the shape `{ "messages": [{ "role": string, "content": string }], "system": string }`.
2. THE Lambda_Proxy SHALL map the `messages` array to the Bedrock Converse API message format and the `system` field to the system prompt parameter.
3. THE Lambda_Proxy SHALL set the response `Content-Type` header to `text/event-stream`.
4. THE Lambda_Proxy SHALL set the response `Cache-Control` header to `no-cache`.
5. IF the request body is missing the `messages` field or the field is not an array, THEN THE Lambda_Proxy SHALL respond with HTTP 400 and a JSON error body `{ "error": "messages field is required and must be an array" }`.
