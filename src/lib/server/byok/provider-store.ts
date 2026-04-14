import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';
import { config } from '../config.js';

/**
 * Encrypted storage for BYOK provider configurations.
 *
 * API keys are encrypted at rest using AES-256-GCM with a key derived
 * from SESSION_SECRET via HKDF. Each write uses a fresh random IV.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const HKDF_INFO = 'copilot-byok-provider';

export interface ProviderConfig {
  type?: 'openai' | 'azure' | 'anthropic';
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  wireApi?: 'completions' | 'responses';
  azure?: { apiVersion?: string };
}

interface StoredProviderConfig {
  type?: 'openai' | 'azure' | 'anthropic';
  baseUrl: string;
  wireApi?: 'completions' | 'responses';
  azure?: { apiVersion?: string };
  encryptedApiKey?: string;
  encryptedBearerToken?: string;
}

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', HKDF_INFO, 32));
}

function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

function decrypt(sealed: string, secret: string): string {
  const key = deriveKey(secret);
  const buf = Buffer.from(sealed, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

function providerFilePath(userLogin: string): string {
  return join(config.settingsStorePath, `${userLogin}.byok.json`);
}

export async function saveProviderConfig(userLogin: string, provider: ProviderConfig): Promise<void> {
  const secret = config.sessionSecret;
  const stored: StoredProviderConfig = {
    type: provider.type,
    baseUrl: provider.baseUrl,
    wireApi: provider.wireApi,
    azure: provider.azure,
  };

  if (provider.apiKey) {
    stored.encryptedApiKey = encrypt(provider.apiKey, secret);
  }
  if (provider.bearerToken) {
    stored.encryptedBearerToken = encrypt(provider.bearerToken, secret);
  }

  const dir = config.settingsStorePath;
  await mkdir(dir, { recursive: true });
  const filePath = providerFilePath(userLogin);
  const tmpPath = filePath + '.tmp.' + randomBytes(4).toString('hex');
  await writeFile(tmpPath, JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 });
  await rename(tmpPath, filePath);
}

export async function loadProviderConfig(userLogin: string): Promise<ProviderConfig | null> {
  const secret = config.sessionSecret;
  try {
    const raw = await readFile(providerFilePath(userLogin), 'utf8');
    const stored: StoredProviderConfig = JSON.parse(raw);
    const result: ProviderConfig = {
      type: stored.type,
      baseUrl: stored.baseUrl,
      wireApi: stored.wireApi,
      azure: stored.azure,
    };

    if (stored.encryptedApiKey) {
      result.apiKey = decrypt(stored.encryptedApiKey, secret);
    }
    if (stored.encryptedBearerToken) {
      result.bearerToken = decrypt(stored.encryptedBearerToken, secret);
    }

    return result;
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.error('[BYOK] Failed to load provider config:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function deleteProviderConfig(userLogin: string): Promise<void> {
  try {
    await unlink(providerFilePath(userLogin));
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[BYOK] Failed to delete provider config:', err instanceof Error ? err.message : err);
    }
  }
}

/** Returns a sanitized version of the provider config (no secrets) for client display. */
export function sanitizeProviderForClient(provider: ProviderConfig): Record<string, unknown> {
  return {
    type: provider.type || 'openai',
    baseUrl: provider.baseUrl,
    wireApi: provider.wireApi,
    hasApiKey: Boolean(provider.apiKey),
    hasBearerToken: Boolean(provider.bearerToken),
    azure: provider.azure,
  };
}
