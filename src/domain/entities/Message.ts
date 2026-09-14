export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
  result?: unknown;
}

export interface Message {
  id: string;
  sessionId: string;
  runId?: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  createdAt: Date;
}

export interface CreateMessageDTO {
  sessionId: string;
  runId?: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
}
