import { homedir } from 'node:os';
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

  return new CopilotClient({
    connection: RuntimeConnection.forStdio(),
    gitHubToken: githubToken,
    workingDirectory: config.copilotCwd || homedir(),
    ...(configDir && { baseDirectory: configDir }),
    ...(telemetry && { telemetry }),
    enableRemoteSessions: config.enableRemoteSessions,
  });
}
