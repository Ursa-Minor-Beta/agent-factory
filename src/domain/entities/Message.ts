export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
// Outcome of the run behind an assistant message; 'failed' - content is the error message
export type MessageStatus = 'completed' | 'failed' | 'cancelled';

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
  status?: MessageStatus; // Assistant messages only
  createdAt: Date;
}

export interface CreateMessageDTO {
  sessionId: string;
  runId?: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  files?: string[];
  status?: MessageStatus;
}
