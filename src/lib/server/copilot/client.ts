import { homedir } from 'node:os';
import { join } from 'node:path';
import { CopilotClient, RuntimeConnection } from '@github/copilot-sdk';
import type { TelemetryConfig } from '@github/copilot-sdk';
import { config } from '../config.js';

function buildTelemetryConfig(): TelemetryConfig | undefined {
  if (!config.otelEndpoint) return undefined;
  return {
    otlpEndpoint: config.otelEndpoint,
    captureContent: config.otelCaptureContent,
    sourceName: config.otelSourceName,
  };
}

export function createCopilotClient(githubToken: string, configDir?: string): CopilotClient {
  const telemetry = buildTelemetryConfig();

  // Empty mode requires an explicit persistence location, so always resolve one.
  const baseDirectory = configDir || config.copilotConfigDir || join(homedir(), '.copilot');

  return new CopilotClient({
    connection: RuntimeConnection.forStdio(),
    gitHubToken: githubToken,
    workingDirectory: config.copilotCwd || homedir(),
    // "empty" mode disables the CLI's ambient host capabilities by default;
    // each session explicitly opts back into the features this app uses.
    mode: config.copilotClientMode,
    baseDirectory,
    ...(telemetry && { telemetry }),
    enableRemoteSessions: config.enableRemoteSessions,
  });
}
