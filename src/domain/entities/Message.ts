export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  status: 'completed' | 'failed';
}

export interface Message {
  id: string;
  sessionId: string;
  runId?: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  files?: string[]; // Format: "inner:<fileId>:<fieldName>"
  createdAt: Date;
}

export interface CreateMessageDTO {
  sessionId: string;
  runId?: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  files?: string[];
}
