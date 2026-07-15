import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { mapToBedrockMessages } from './message-mapper';
import { formatSSEChunk } from './sse';

const client = new BedrockRuntimeClient({});
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';

interface RequestBody {
  messages: Array<{ role: string; content: string }>;
  system?: string;
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  // Parse and validate
  let body: Partial<RequestBody>;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'messages field is required and must be an array' }),
    };
  }

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
