#!/usr/bin/env node

/**
 * Generate VAPID keys for Web Push notifications.
 * Run once: node scripts/generate-vapid-keys.mjs
 * 
 * Copy the output to your .env file or Azure Key Vault.
 */

import webPush from 'web-push';

const vapidKeys = webPush.generateVAPIDKeys();

console.log('VAPID Keys Generated');
console.log('====================');
console.log('');
console.log('Add these to your environment variables:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:your-email@example.com`);
console.log('');
console.log('For docker-compose.yml:');
console.log('');
console.log('  environment:');
console.log(`    - VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`    - VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log('    - VAPID_SUBJECT=mailto:your-email@example.com');
