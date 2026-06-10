import { beforeEach, describe, expect, it, vi } from 'vitest';

const configMock = vi.hoisted(() => ({
  copilotConfigDir: '/copilot-config',
  copilotClientMode: 'empty' as string,
}));

vi.mock('@github/copilot-sdk', () => {
  class ToolSetMock {
    private tools: string[] = [];
    addBuiltIn(name: string) { this.tools.push(`builtin:${name}`); return this; }
    addMcp(name: string) { this.tools.push(`mcp:${name}`); return this; }
    addCustom(name: string) { this.tools.push(`custom:${name}`); return this; }
    toArray() { return [...this.tools]; }
  }
  return {
    CopilotClient: vi.fn(),
    ToolSet: ToolSetMock,
  };
});

vi.mock('../config.js', () => ({ config: configMock }));

import { buildEmptyModeSessionDefaults } from './session.js';

describe('buildEmptyModeSessionDefaults', () => {
  beforeEach(() => {
    configMock.copilotClientMode = 'empty';
  });

  it('returns no overrides when the client is not in empty mode', () => {
    configMock.copilotClientMode = 'copilot-cli';
    expect(buildEmptyModeSessionDefaults()).toEqual({});
  });

  it('re-enables features the app relies on under empty mode', () => {
    const defaults = buildEmptyModeSessionDefaults();

    expect(defaults).toMatchObject({
      enableSkills: true,
      enableConfigDiscovery: true,
      enableHostGitOperations: true,
      enableSessionStore: true,
      enableOnDemandInstructionDiscovery: true,
      mcpOAuthTokenStorage: 'persistent',
      embeddingCacheStorage: 'persistent',
      skipEmbeddingRetrieval: false,
      skipCustomInstructions: false,
      coauthorEnabled: true,
    });
  });

  it('grants all built-in, MCP, and custom tools via availableTools', () => {
    const defaults = buildEmptyModeSessionDefaults();
    expect(defaults.availableTools).toEqual(['builtin:*', 'mcp:*', 'custom:*']);
  });

  it('does not re-enable file hooks or telemetry', () => {
    const defaults = buildEmptyModeSessionDefaults();
    expect(defaults).not.toHaveProperty('enableFileHooks');
    expect(defaults).not.toHaveProperty('enableSessionTelemetry');
  });
});
