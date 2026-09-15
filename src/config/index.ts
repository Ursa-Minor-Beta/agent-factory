import 'dotenv/config';

export const config = {
  server: {
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    env: process.env['NODE_ENV'] ?? 'development',
  },
  mongodb: {
    uri: process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/agent-factory',
  },
  jwt: {
    secret: process.env['JWT_SECRET'] ?? 'change-me-in-production',
    accessExpiresIn: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '15m',
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d',
  },
  encryption: {
    // 32-byte hex key for AES-256 encryption of sensitive data
    key: process.env['ENCRYPTION_KEY'] ?? 'change-me-in-production-32bytes!',
  },
  admin: {
    email: process.env['ADMIN_EMAIL'],
    password: process.env['ADMIN_PASSWORD'],
    name: process.env['ADMIN_NAME'] ?? 'Admin',
  },
  jsNode: {
    defaultTimeoutMs: parseInt(process.env['JS_NODE_DEFAULT_TIMEOUT_MS'] ?? '5000', 10),
    maxTimeoutMs: parseInt(process.env['JS_NODE_MAX_TIMEOUT_MS'] ?? '30000', 10),
    defaultMemoryMb: parseInt(process.env['JS_NODE_DEFAULT_MEMORY_MB'] ?? '64', 10),
    maxMemoryMb: parseInt(process.env['JS_NODE_MAX_MEMORY_MB'] ?? '256', 10),
  },
} as const;

// Validate required config
export function validateConfig() {
  if (!config.admin.email || !config.admin.password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required environment variables');
  }
}

export type Config = typeof config;
