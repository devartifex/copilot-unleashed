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
  console.log(`    - VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
} else {
  console.log('    # VAPID_PRIVATE_KEY was generated but is hidden by default.');
  console.log('    # Re-run with "--show-private" to display it.');
}
