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
