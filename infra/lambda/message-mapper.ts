import type { Message } from '@aws-sdk/client-bedrock-runtime';

export interface FrontendMessage {
  role: string;
  content: string;
}

export function mapToBedrockMessages(messages: FrontendMessage[]): Message[] {
  return messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: [{ text: msg.content }],
  }));
}
