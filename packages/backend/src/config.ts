export const API_PREFIX = '/api/v1';
export const BETTER_AUTH_BASE_URL = (process.env.BETTER_AUTH_URL || 'https://localhost:8081').replace(/\/+$/, '');
export const MCP_BASE_URL = process.env.MCP_BASE_URL || BETTER_AUTH_BASE_URL;
