import fs from 'fs';
import path from 'path';

const SERVER_CARD_PATH = path.resolve(__dirname, '../../../../frontend/public/.well-known/mcp/server-card.json');
const TOOLS_DIR = path.join(__dirname, 'tools');
const PROMPTS_DIR = path.join(__dirname, 'prompts');

interface ServerCard {
  serverInfo: { name: string; version: string };
  tools: Array<{ name: string; description: string }>;
  prompts: Array<{ name: string; description: string }>;
}

function readServerCard(): ServerCard {
  return JSON.parse(fs.readFileSync(SERVER_CARD_PATH, 'utf-8'));
}

function extractToolNamesFromSources(): string[] {
  const names: string[] = [];
  for (const entry of fs.readdirSync(TOOLS_DIR)) {
    if (!entry.endsWith('.ts') || entry === 'helpers.ts') continue;
    if (entry.includes('.unit.') || entry.includes('.e2e.')) continue;

    const content = fs.readFileSync(path.join(TOOLS_DIR, entry), 'utf-8');
    const match = content.match(/server\.registerTool\(\s*['"]([^'"]+)['"]/);
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}

function extractPromptNamesFromSources(): string[] {
  const names: string[] = [];
  for (const entry of fs.readdirSync(PROMPTS_DIR)) {
    if (!entry.endsWith('.ts')) continue;
    if (entry.includes('.unit.') || entry.includes('.e2e.')) continue;

    const content = fs.readFileSync(path.join(PROMPTS_DIR, entry), 'utf-8');
    const match = content.match(/export\s+const\s+\w+_NAME\s*=\s*['"]([^'"]+)['"]/);
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}

function extractServerVersionFromSource(): string {
  const content = fs.readFileSync(path.join(__dirname, 'server.ts'), 'utf-8');
  const match = content.match(/version:\s*['"]([^'"]+)['"]/);
  if (!match?.[1]) throw new Error('Could not find version in server.ts');
  return match[1];
}

describe('MCP server-card drift', () => {
  it('tools array matches tools registered in tools/*.ts sources', () => {
    const card = readServerCard();
    const cardTools = card.tools.map((t) => t.name).toSorted();
    const sourceTools = extractToolNamesFromSources().toSorted();

    expect(cardTools).toEqual(sourceTools);
  });

  it('prompts array matches prompt name constants in prompts/*.ts sources', () => {
    const card = readServerCard();
    const cardPrompts = card.prompts.map((p) => p.name).toSorted();
    const sourcePrompts = extractPromptNamesFromSources().toSorted();

    expect(cardPrompts).toEqual(sourcePrompts);
  });

  it('serverInfo.version matches the version in createMcpServer()', () => {
    const card = readServerCard();
    expect(card.serverInfo.version).toBe(extractServerVersionFromSource());
  });

  it('every tool has a non-empty description', () => {
    const card = readServerCard();
    for (const tool of card.tools) {
      expect(tool.description).toBeTruthy();
    }
  });
});
