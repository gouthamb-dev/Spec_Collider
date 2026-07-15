# Design Document: Bedrock Deployment

## Overview

This design replaces the existing OpenAI-compatible streaming backend with an Amazon Bedrock ConverseStream API fronted by a Lambda proxy. The frontend React SPA deploys to CloudFront + S3, and all infrastructure is defined in a single AWS CDK (TypeScript) stack. The existing `AgentOrchestrator` streaming interface (`AsyncGenerator<StreamChunk>`) is preserved — only the underlying transport changes.

## Architecture

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────────┐       ┌──────────────┐
│  React SPA  │──SSE──│  HTTP API GW     │──POST─│  Lambda Proxy   │──SDK──│  Bedrock     │
│ (CloudFront)│       │  (no auth, CORS) │       │  (Node.js 20.x) │       │  ConverseAPI │
└─────────────┘       └──────────────────┘       └─────────────────┘       └──────────────┘
       │
       │  served from
       ▼
┌─────────────┐
│  S3 Bucket  │
│  (private,  │
│   OAC)      │
└─────────────┘
```

**Data flow:**
1. Frontend `AgentOrchestrator` POSTs `{ messages, system }` to the API Gateway endpoint
2. API Gateway forwards to the Lambda proxy (no auth)
3. Lambda maps the payload to Bedrock `ConverseStreamCommand` format and invokes the model
4. Bedrock streams response chunks back to the Lambda
5. Lambda formats each chunk as an SSE event (`data: {"content":"...","done":false}\n\n`) and writes to the response stream
6. Frontend parses SSE chunks and yields `StreamChunk` objects from the `AsyncGenerator`

## Components

### 1. Lambda Proxy Handler (`infra/lambda/handler.ts`)

The Lambda function is the only new runtime code. It:
- Receives the HTTP request body
- Validates the payload (messages array required)
- Maps frontend message format to Bedrock Converse API message format
- Invokes `ConverseStreamCommand` via `BedrockRuntimeClient`
- Streams each content delta as an SSE event
- Handles errors with appropriate HTTP status codes

```typescript
// infra/lambda/handler.ts
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const client = new BedrockRuntimeClient({});
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';

interface RequestBody {
  messages: Array<{ role: string; content: string }>;
  system: string;
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  // Parse and validate
  const body = JSON.parse(event.body ?? '{}') as Partial<RequestBody>;

  if (!body.messages || !Array.isArray(body.messages)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'messages field is required and must be an array' }),
    };
  }

  // Map to Bedrock format
  const bedrockMessages = mapToBedrockMessages(body.messages);
  const systemPrompt = body.system ? [{ text: body.system }] : undefined;

  try {
    const command = new ConverseStreamCommand({
      modelId: MODEL_ID,
      messages: bedrockMessages,
      system: systemPrompt,
    });

    const response = await client.send(command);
    const chunks: string[] = [];

    if (response.stream) {
      for await (const event of response.stream) {
        if (event.contentBlockDelta?.delta?.text) {
          const text = event.contentBlockDelta.delta.text;
          chunks.push(formatSSEChunk(text, false));
        }
      }
    }

    // Final done event
    chunks.push(formatSSEChunk('', true));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: chunks.join(''),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message }),
    };
  }
}
```

### 2. SSE Formatting Utilities (`infra/lambda/sse.ts`)

Pure functions for formatting and parsing SSE events — shared between Lambda and frontend tests.

```typescript
// infra/lambda/sse.ts
export interface SSEPayload {
  content: string;
  done: boolean;
}

export function formatSSEChunk(content: string, done: boolean): string {
  return `data: ${JSON.stringify({ content, done })}\n\n`;
}

export function parseSSEChunk(raw: string): SSEPayload | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('data: ')) return null;
  const json = trimmed.slice(6);
  if (json === '[DONE]') return { content: '', done: true };
  try {
    return JSON.parse(json) as SSEPayload;
  } catch {
    return null;
  }
}
```

### 3. Message Mapping (`infra/lambda/message-mapper.ts`)

Maps frontend message format to Bedrock ConverseStream API format.

```typescript
// infra/lambda/message-mapper.ts
import type { Message } from '@aws-sdk/client-bedrock-runtime';

interface FrontendMessage {
  role: string;
  content: string;
}

export function mapToBedrockMessages(messages: FrontendMessage[]): Message[] {
  return messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: [{ text: msg.content }],
  }));
}
```

### 4. Frontend Orchestrator Adaptation (`src/agents/orchestrator.ts`)

The existing `AgentOrchestrator` changes minimally:
- Replace `baseUrl` (OpenAI) with the API Gateway endpoint URL
- Simplify the request body to `{ messages, system }` (no model field, no auth header)
- Retain the SSE parsing logic (already compatible with the new format)
- Preserve all method signatures (`invokeRedTeam`, `invokeArchitect`, `invokeChaos`)

```typescript
// Changes to AgentOrchestratorConfig
export interface AgentOrchestratorConfig {
  endpointUrl: string;         // API Gateway URL (replaces apiKey + baseUrl + model)
  redTeamSystemPrompt: string;
  architectSystemPrompt: string;
  timeoutMs?: number;
}

// Request body sent to Lambda
interface LambdaRequestBody {
  messages: Array<{ role: string; content: string }>;
  system: string;
}
```

The `invokeAgent` private method changes from:
- `POST ${baseUrl}/chat/completions` with OpenAI payload + Bearer auth
- To: `POST ${endpointUrl}` with `{ messages, system }` payload, no auth header

SSE parsing logic remains identical — both OpenAI and the new Lambda use `data: {...}\n\n` format.

### 5. CDK Stack (`infra/lib/bedrock-stack.ts`)

Single stack defining all resources:

```typescript
// infra/lib/bedrock-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';

export class BedrockStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- S3 Bucket (private, all public access blocked) ---
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- CloudFront Distribution with OAC ---
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // --- Lambda Proxy ---
    const MODEL_ID = 'us.amazon.nova-2-lite-v1:0';

    const lambdaFn = new NodejsFunction(this, 'BedrockProxy', {
      runtime: Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../lambda/handler.ts'),
      handler: 'handler',
      environment: {
        BEDROCK_MODEL_ID: MODEL_ID,
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
    });

    // --- IAM: Least-privilege Bedrock permission ---
    lambdaFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${MODEL_ID}`,
        ],
      })
    );

    // --- HTTP API Gateway ---
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [
          `https://${distribution.distributionDomainName}`,
          'http://localhost:*',
        ],
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type'],
      },
    });

    httpApi.addRoutes({
      path: '/converse',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('LambdaIntegration', lambdaFn),
    });

    // --- S3 Deployment (frontend assets) ---
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../dist'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
    });
  }
}
```

## Interfaces

### Lambda Request/Response Contract

**Request (POST /converse):**
```typescript
interface LambdaRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system: string;
}
```

**Response (200 OK) — streaming SSE:**
```
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"content":"Hello","done":false}

data: {"content":" world","done":false}

data: {"content":"","done":true}

```

**Response (400 Bad Request):**
```json
{ "error": "messages field is required and must be an array" }
```

**Response (500 Internal Server Error):**
```json
{ "error": "<error message from Bedrock or runtime>" }
```

### AgentOrchestratorConfig (updated)

```typescript
export interface AgentOrchestratorConfig {
  endpointUrl: string;           // e.g. "https://abc123.execute-api.us-east-1.amazonaws.com/converse"
  redTeamSystemPrompt: string;
  architectSystemPrompt: string;
  timeoutMs?: number;
}
```

### StreamChunk (unchanged)

```typescript
export interface StreamChunk {
  content: string;
  done: boolean;
  source: AgentRole;
  timestamp: number;
}
```

## Data Models

### Bedrock Message Mapping

| Frontend Field | Bedrock Field | Transformation |
|---|---|---|
| `messages[].role` | `messages[].role` | Direct pass-through (`user` or `assistant`) |
| `messages[].content` | `messages[].content[0].text` | Wrap string in `[{ text: content }]` |
| `system` | `system[0].text` | Wrap string in `[{ text: system }]` |

### Environment Variables

| Variable | Value | Used By |
|---|---|---|
| `BEDROCK_MODEL_ID` | `us.amazon.nova-2-lite-v1:0` | Lambda handler |
| `VITE_API_ENDPOINT` | API Gateway URL (output from CDK) | Frontend build |

## Error Handling

| Scenario | Lambda Behavior | Frontend Behavior |
|---|---|---|
| Invalid request body (missing messages) | 400 + JSON error | `AgentOrchestrator` throws with status + message |
| Bedrock API error | 500 + JSON error | `AgentOrchestrator` throws with status + message |
| Bedrock stream interruption | 500 + JSON error (partial) | `AgentOrchestrator` throws on non-2xx or network error |
| Lambda timeout | API GW 504 | `AgentOrchestrator` throws on non-2xx |
| Network error (no response) | N/A | `AgentOrchestrator` throws (existing AbortError/timeout logic) |

## File Structure

```
red/
├── infra/
│   ├── bin/
│   │   └── app.ts                  # CDK app entry point
│   ├── lib/
│   │   └── bedrock-stack.ts        # Single CDK stack
│   ├── lambda/
│   │   ├── handler.ts              # Lambda proxy handler
│   │   ├── sse.ts                  # SSE format/parse utilities
│   │   └── message-mapper.ts       # Frontend → Bedrock message mapping
│   ├── package.json                # CDK + Lambda dependencies
│   ├── tsconfig.json               # TypeScript config for infra
│   └── cdk.json                    # CDK config
├── src/
│   └── agents/
│       └── orchestrator.ts         # Modified: new endpoint, simplified payload
└── ...
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: SSE round-trip preserves content

For any arbitrary string `content` and boolean `done`, formatting the values into an SSE chunk with `formatSSEChunk(content, done)` and then parsing the result with `parseSSEChunk` SHALL produce an object with the same `content` and `done` values.

**Validates: Requirements 1.2, 2.3**

### Property 2: Error responses are well-formed

For any error thrown by the Bedrock client (with any error message string), the Lambda handler SHALL respond with a non-2xx HTTP status code and a JSON body containing an `error` field whose value is a non-empty string.

**Validates: Requirements 1.4**

### Property 3: Non-2xx status propagation

For any HTTP response with a status code outside the 200-299 range and any JSON error body, the Agent_Orchestrator SHALL throw an Error whose message includes both the numeric status code and the error text from the response body.

**Validates: Requirements 2.5**

### Property 4: Message mapping to Bedrock format

For any non-empty array of frontend messages (each with a `role` string and `content` string) and any system prompt string, `mapToBedrockMessages` SHALL produce an array of equal length where each element has `role` matching the input and `content` equal to `[{ text: inputContent }]`.

**Validates: Requirements 7.1, 7.2**

### Property 5: Invalid payload rejection

For any request body that either lacks a `messages` field or has a `messages` field that is not an array, the Lambda handler SHALL respond with HTTP 400 and a JSON body equal to `{ "error": "messages field is required and must be an array" }`.

**Validates: Requirements 7.5**
