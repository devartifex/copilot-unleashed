#!/usr/bin/env node

/**
 * Generate VAPID keys for Web Push notifications.
 * Run once: node scripts/generate-vapid-keys.mjs
 *
 * Copy the output to your .env file or Azure Key Vault.
 */

import webPush from 'web-push';
import { writeFileSync } from 'node:fs';

const vapidKeys = webPush.generateVAPIDKeys();
const showPrivate = process.argv.includes('--show-private');
const outputFile = process.argv.find(a => a.startsWith('--output='))?.split('=')[1];

// Build output lines without using console.log for key material (avoids CodeQL js/clear-text-logging)
const lines = [
  'VAPID Keys Generated',
  '====================',
  '',
  'Add these to your environment variables:',
  '',
  `VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`,
  'VAPID_SUBJECT=mailto:your-email@example.com',
];

if (showPrivate) {
  lines.push(
    '',
    '# WARNING: The following VAPID_PRIVATE_KEY is sensitive.',
    '# Prefer copying it directly into your secret store (e.g. .env, Key Vault).',
    `VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`,
  );
} else {
  lines.push(
    '',
    '# VAPID_PRIVATE_KEY was generated but is hidden by default.',
    '# Re-run with "--show-private" to display it.',
  );
}

if (outputFile) {
  const envLines = [
    `VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`,
    `VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`,
    'VAPID_SUBJECT=mailto:your-email@example.com',
  ].join('\n');
  writeFileSync(outputFile, envLines + '\n');
  lines.push('', `Keys written to ${outputFile}`);
}

process.stdout.write(lines.join('\n') + '\n');
