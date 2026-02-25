declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      DB_QUERY_LOGGING: 'true' | 'false';
      // Add other environment variables here as needed
      // For example:
      // PORT?: string;
      // DATABASE_URL?: string;
    }
  }
}

// oxlint-disable-next-line unicorn/require-module-specifiers -- needed to make this a module for `declare global`
export {};
