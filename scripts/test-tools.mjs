#!/usr/bin/env node
/**
 * Diagnostic script: connect to copilot-unleashed via WebSocket,
 * create a session, list tools, and send a message that triggers GitHub tool use.
 * 
 * Usage: node scripts/test-tools.mjs
 * Requires: the app running on localhost:3000, a valid GitHub token.
 */

import WebSocket from 'ws';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const WS_URL = BASE.replace('http', 'ws');

async function getSessionCookie() {
  // Step 1: Start device flow (or use existing token)
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error('Server not reachable');
  console.log('[OK] Server is reachable');
  return null; // We'll need to authenticate first
}

async function startDeviceFlow() {
  console.log('\n[AUTH] Starting device flow...');
  const startRes = await fetch(`${BASE}/auth/device/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  
  // Get session cookie from response
  const cookies = startRes.headers.get('set-cookie');
  const sessionId = cookies?.match(/connect\.sid=([^;]+)/)?.[1];
  
  const startData = await startRes.json();
  console.log('[AUTH] Device flow started:');
  console.log(`  → Go to: ${startData.verificationUri}`);
  console.log(`  → Enter code: ${startData.userCode}`);
  console.log(`  → Session cookie: ${sessionId ? 'obtained' : 'missing'}`);
  
  if (!sessionId) {
    console.error('[ERROR] No session cookie received');
    return null;
  }
  
  // Poll for authorization
  console.log('\n[AUTH] Waiting for authorization (poll every 5s)...');
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    
    const pollRes = await fetch(`${BASE}/auth/device/poll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `connect.sid=${sessionId}`,
      },
    });
    
    const pollData = await pollRes.json();
    console.log(`  [poll ${i + 1}] status: ${pollData.status}`);
    
    if (pollData.status === 'authorized') {
      console.log(`[AUTH] Authorized as: ${pollData.user?.login}`);
      return { sessionId, user: pollData.user };
    }
    
    if (pollData.status === 'access_denied' || pollData.status === 'expired') {
      console.error(`[AUTH] Flow ended: ${pollData.status}`);
      return null;
    }
  }
  
  console.error('[AUTH] Timeout waiting for authorization');
  return null;
}

async function testWebSocket(sessionId) {
  return new Promise((resolve) => {
    console.log('\n[WS] Connecting...');
    const ws = new WebSocket(WS_URL, {
      headers: {
        'Cookie': `connect.sid=${sessionId}`,
      },
    });
    
    const messages = [];
    let toolsReceived = false;
    let sessionCreated = false;
    
    ws.on('open', () => {
      console.log('[WS] Connected');
      
      // Step 1: Create a session in autopilot mode
      console.log('\n[TEST] Creating session (autopilot mode, gpt-4.1)...');
      ws.send(JSON.stringify({
        type: 'new_session',
        model: 'gpt-4.1',
        mode: 'autopilot',
      }));
    });
    
    ws.on('message', async (raw) => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      
      switch (msg.type) {
        case 'session_created':
          console.log(`[OK] Session created: model=${msg.model}, id=${msg.sessionId}`);
          sessionCreated = true;
          
          // Step 2: List tools
          console.log('\n[TEST] Listing tools...');
          ws.send(JSON.stringify({ type: 'list_tools' }));
          break;
          
        case 'tools':
          console.log(`[TOOLS] Received ${msg.tools?.length || 0} tools`);
          toolsReceived = true;
          
          // Show GitHub-related tools
          const githubTools = (msg.tools || []).filter(t => 
            t.name?.toLowerCase().includes('github') || 
            t.name?.toLowerCase().includes('mcp') ||
            t.description?.toLowerCase().includes('github')
          );
          
          if (githubTools.length > 0) {
            console.log(`[TOOLS] GitHub-related tools (${githubTools.length}):`);
            githubTools.forEach(t => console.log(`  - ${t.name}: ${t.description?.slice(0, 80)}`));
          } else {
            console.log('[WARN] No GitHub-related tools found!');
            console.log('[TOOLS] All tool names:');
            (msg.tools || []).forEach(t => console.log(`  - ${t.name}`));
          }
          
          // Step 3: Send a message that should trigger GitHub tool use
          console.log('\n[TEST] Sending message to trigger GitHub tool use...');
          ws.send(JSON.stringify({
            type: 'message',
            content: 'List my GitHub repositories. Use the GitHub tools to do this.',
          }));
          break;
          
        case 'tool_start':
          console.log(`[TOOL-START] ${msg.toolName} (mcp: ${msg.mcpServerName}/${msg.mcpToolName})`);
          break;
          
        case 'tool_end':
          console.log(`[TOOL-END] ${msg.toolCallId}`);
          break;
          
        case 'tool_progress':
          console.log(`[TOOL-PROGRESS] ${msg.toolCallId}: ${msg.message?.slice(0, 100)}`);
          break;
          
        case 'delta':
          process.stdout.write(msg.content || '');
          break;
          
        case 'turn_end':
          console.log('\n\n[TURN-END] Response complete');
          
          // Step 4: Send permission_request auto-approve test
          console.log('\n[TEST] Sending another message to verify...');
          ws.send(JSON.stringify({
            type: 'message',
            content: 'What GitHub tools are available to you? List all tool names that contain "github" in them.',
          }));
          
          // Wait a bit then close
          setTimeout(() => {
            console.log('\n\n[DONE] Test complete');
            console.log(`[SUMMARY] Total messages received: ${messages.length}`);
            console.log(`[SUMMARY] Session created: ${sessionCreated}`);
            console.log(`[SUMMARY] Tools listed: ${toolsReceived}`);
            
            const toolStarts = messages.filter(m => m.type === 'tool_start');
            console.log(`[SUMMARY] Tool calls observed: ${toolStarts.length}`);
            toolStarts.forEach(t => console.log(`  - ${t.toolName} (${t.mcpServerName})`));
            
            const errors = messages.filter(m => m.type === 'error');
            if (errors.length > 0) {
              console.log(`[SUMMARY] Errors: ${errors.length}`);
              errors.forEach(e => console.log(`  - ${e.message}`));
            }
            
            ws.close();
            resolve(messages);
          }, 30000);
          break;
          
        case 'error':
          console.error(`[ERROR] ${msg.message}`);
          break;
          
        case 'permission_request':
          console.log(`[PERMISSION] Tool: ${msg.toolName}, auto-allowing...`);
          ws.send(JSON.stringify({
            type: 'permission_response',
            decision: 'allow',
            toolName: msg.toolName,
            requestId: msg.requestId,
          }));
          break;
          
        case 'warning':
          console.warn(`[WARNING] ${msg.message}`);
          break;
          
        case 'info':
          console.log(`[INFO] ${msg.message}`);
          break;
          
        default:
          // Log other message types briefly
          if (!['delta', 'reasoning_delta', 'reasoning_done', 'usage', 'context_info', 'intent'].includes(msg.type)) {
            console.log(`[MSG] ${msg.type}: ${JSON.stringify(msg).slice(0, 120)}`);
          }
      }
    });
    
    ws.on('error', (err) => {
      console.error(`[WS-ERROR] ${err.message}`);
      resolve(messages);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`[WS] Closed: code=${code} reason=${reason.toString()}`);
      resolve(messages);
    });
  });
}

// Main
async function main() {
  try {
    await getSessionCookie();
    
    const auth = await startDeviceFlow();
    if (!auth) {
      console.error('\n[FAILED] Could not authenticate. Exiting.');
      process.exit(1);
    }
    
    await testWebSocket(auth.sessionId);
  } catch (err) {
    console.error('[FATAL]', err);
    process.exit(1);
  }
}

main();
