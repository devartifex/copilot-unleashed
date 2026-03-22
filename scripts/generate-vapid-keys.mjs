#!/usr/bin/env node

/**
 * Generate VAPID keys for Web Push notifications.
 * Run once: node scripts/generate-vapid-keys.mjs
 * 
 * Copy the output to your .env file or Azure Key Vault.
 */

import webPush from 'web-push';

const vapidKeys = webPush.generateVAPIDKeys();
const showPrivate = process.argv.includes('--show-private');

console.log('VAPID Keys Generated');
console.log('====================');
console.log('');
console.log('Add these to your environment variables:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_SUBJECT=mailto:your-email@example.com`);

if (showPrivate) {
  console.log('');
  console.log('# WARNING: The following VAPID_PRIVATE_KEY is sensitive.');
  console.log('# It may be captured in shell history, CI logs, or terminal logs.');
  console.log('# Prefer copying it directly into your secret store (e.g. .env, Key Vault)');
  console.log('# and avoid committing or storing this output in version control.');
  console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
} else {
  console.log('# VAPID_PRIVATE_KEY was generated but is hidden by default.');
  console.log('# Re-run with "--show-private" to display it, or store it directly from code.');
}

console.log('');
console.log('For docker-compose.yml:');
console.log('');
console.log('  environment:');
console.log(`    - VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log('    - VAPID_SUBJECT=mailto:your-email@example.com');

if (showPrivate) {
  console.log('    # WARNING: VAPID_PRIVATE_KEY is sensitive; avoid committing docker-compose.yml with this value.');
  console.log('    # Store it in a secure secret manager or environment configuration.');
  console.log(`    - VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
} else {
  console.log('    # VAPID_PRIVATE_KEY was generated but is hidden by default.');
  console.log('    # Re-run with "--show-private" to display it.');
}
