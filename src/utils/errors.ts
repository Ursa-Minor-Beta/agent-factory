export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class AgentExecutionError extends AppError {
  constructor(
    message: string,
    public runId: string
  ) {
    super(message, 500, 'AGENT_EXECUTION_ERROR');
    this.name = 'AgentExecutionError';
  }
}

export interface NodeErrorContext {
  request?: {
    url?: string;
    method?: string;
    body?: unknown;
  };
  response?: {
    status?: number;
    statusText?: string;
    body?: string;
  };
  toolCalls?: Array<{ name: string; result: unknown }>;
}

export class NodeExecutionError extends Error {
  public context: NodeErrorContext;
  public originalError?: Error;
  public state?: Record<string, unknown>;

  constructor(
    message: string,
    context: NodeErrorContext = {},
    cause?: unknown,
    state?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'NodeExecutionError';
    this.context = context;
    this.state = state;
    if (cause instanceof Error) {
      this.originalError = cause;
    }
    Error.captureStackTrace(this, this.constructor);
  }
}
