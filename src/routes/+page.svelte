<script lang="ts">
  import DeviceFlowLogin from '$lib/components/DeviceFlowLogin.svelte';
  import MessageList from '$lib/components/MessageList.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import Banner from '$lib/components/Banner.svelte';
  import EnvInfo from '$lib/components/EnvInfo.svelte';
  import PlanPanel from '$lib/components/PlanPanel.svelte';
  import PermissionPrompt from '$lib/components/PermissionPrompt.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import SettingsModal from '$lib/components/SettingsModal.svelte';
  import SessionsSheet from '$lib/components/SessionsSheet.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import ModelSheet from '$lib/components/ModelSheet.svelte';
  import { createWsStore } from '$lib/stores/ws.svelte.js';
  import { createChatStore } from '$lib/stores/chat.svelte.js';
  import { createSettingsStore } from '$lib/stores/settings.svelte.js';
  import type { Attachment, SessionMode, ReasoningEffort } from '$lib/types/index.js';

  let { data } = $props();

  // ── Stores ─────────────────────────────────────────────────────────────
  const wsStore = createWsStore();
  const chatStore = createChatStore(wsStore);
  const settings = createSettingsStore();

  // ── UI state ───────────────────────────────────────────────────────────
  let sidebarOpen = $state(false);
  let settingsOpen = $state(false);
  let sessionsOpen = $state(false);
  let modelSheetOpen = $state(false);
  let sessionsLoading = $state(false);
  let sessionLoading = $state(true);

  // Use the confirmed model from the active session; fall back to the user's saved preference
  // so the TopBar/ModelSheet show the correct model immediately before session_created arrives.
  const effectiveModel = $derived(chatStore.currentModel || settings.selectedModel || 'gpt-4.1');

  const modelCount = $derived(chatStore.models.size);
  const toolCount = $derived(chatStore.tools.length);
  const mcpServerCount = $derived(
    new Set(chatStore.tools.filter(t => t.mcpServerName).map(t => t.mcpServerName)).size
  );

  const supportsVision = $derived.by(() => {
    const model = settings.selectedModel || 'gpt-4.1';
    const info = chatStore.models.get(model);
    return info?.capabilities?.supports?.vision === true;
  });

  const activeSkillCount = $derived(
    settings.availableSkills.length - settings.disabledSkills.length
  );

  const modeStyle = $derived.by(() => {
    switch (chatStore.mode) {
      case 'plan':
        return '--mode-color:#58a6ff;--mode-border:rgba(88,166,255,0.45);--mode-user-bg:rgba(88,166,255,0.10);--mode-user-border:rgba(88,166,255,0.22);--mode-banner-bg:rgba(88,166,255,0.07)';
      case 'autopilot':
        return '--mode-color:#3fb950;--mode-border:rgba(63,185,80,0.45);--mode-user-bg:rgba(63,185,80,0.10);--mode-user-border:rgba(63,185,80,0.22);--mode-banner-bg:rgba(63,185,80,0.07)';
      default:
        return '--mode-color:#d2a8ff;--mode-border:#7c5cb5;--mode-user-bg:rgba(137,87,229,0.12);--mode-user-border:rgba(137,87,229,0.20);--mode-banner-bg:rgba(137,87,229,0.08)';
    }
  });

  // ── Debug: trace data.authenticated changes ──────────────────────────
  $effect(() => {
    console.log(`[PAGE] data.authenticated=${data.authenticated} user=${JSON.stringify(data.user)}`);
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────
  $effect(() => {
    if (data.authenticated) {
      console.log(`[PAGE] authenticated=true, loading settings & connecting WS`);
      settings.load();
      settings.syncFromServer();
      settings.fetchSkills();
      wsStore.connect();

      // Wire WS messages → chat store
      const unsub = wsStore.onMessage((msg) => {
        console.log(`[PAGE] WS message received: type=${msg.type}`, msg);
        chatStore.handleServerMessage(msg);

        // The server pre-loads persisted state and includes sdkSessionId
        // directly in the 'connected' message — no timer/delay needed.
        if (msg.type === 'connected') {
          if (msg.sdkSessionId) {
            // Session will be restored — keep sessionLoading true until cold_resume/session_resumed
            console.log('[PAGE] connected with sdkSessionId, resuming', msg.sdkSessionId);
            wsStore.resumeSession(msg.sdkSessionId, settings.mcpServers.length > 0 ? settings.mcpServers : undefined);
          } else {
            // No previous session — show new chat immediately
            sessionLoading = false;
            console.log('[PAGE] connected without sdkSessionId, creating new session');
            requestNewSession();
          }
        }

        // Session fully loaded — clear loading state
        if (msg.type === 'cold_resume' || msg.type === 'session_created' || msg.type === 'session_resumed' || msg.type === 'session_reconnected') {
          sessionLoading = false;
        }

        // Resume failed — clear loading and fall back to new session
        if (msg.type === 'error' && sessionLoading) {
          sessionLoading = false;
          requestNewSession();
        }

        // Auto-request new session if reconnected without one (warm reconnect, session was cleaned up)
        if (msg.type === 'session_reconnected' && !msg.hasSession) {
          console.log('[PAGE] Got session_reconnected without session, calling requestNewSession()');
          requestNewSession();
        }

        // Auto-request models on session created
        if (msg.type === 'session_created' || msg.type === 'session_reconnected') {
          console.log('[PAGE] Got session_created/reconnected, calling listModels()');
          wsStore.listModels();
        }

        // Auto-request models, plan, tools, and agents on session resumed
        if (msg.type === 'session_resumed') {
          wsStore.listModels();
          wsStore.getPlan();
          wsStore.listTools();
          wsStore.listAgents();
        }

        // Sync mode from SDK to settings on mode_changed (covers resumed sessions)
        if (msg.type === 'mode_changed') {
          settings.selectedMode = msg.mode;
        }

        // Clear sessions loading state
        if (msg.type === 'sessions') {
          sessionsLoading = false;
        }
      });

      return () => {
        console.log('[PAGE] effect cleanup: unsubscribing and disconnecting WS');
        unsub();
        wsStore.disconnect();
      };
    } else {
      console.log(`[PAGE] authenticated=false, showing login screen`);
    }
  });

  // Auto-refresh session list while the panel is open
  $effect(() => {
    if (!sessionsOpen) return;

    const interval = setInterval(() => {
      wsStore.listSessions();
    }, 30_000);

    return () => clearInterval(interval);
  });

  // ── Helpers ────────────────────────────────────────────────────────────
  function requestNewSession(): void {
    const model = settings.selectedModel || 'gpt-4.1';
    const modelInfo = chatStore.models.get(model);
    const isReasoning = modelInfo?.capabilities?.supports?.reasoningEffort;

    wsStore.newSession({
      model,
      mode: settings.selectedMode,
      ...(isReasoning && { reasoningEffort: settings.reasoningEffort }),
      ...(settings.customInstructions.trim() && { customInstructions: settings.customInstructions.trim() }),
      ...(settings.excludedTools.length > 0 && { excludedTools: settings.excludedTools }),
      ...(settings.customTools.length > 0 && { customTools: settings.customTools }),
      ...(settings.customAgents.length > 0 && { customAgents: settings.customAgents }),
      ...(settings.mcpServers.length > 0 && { mcpServers: settings.mcpServers.filter(s => s.enabled) }),
      ...(settings.disabledSkills.length > 0 && { disabledSkills: settings.disabledSkills }),
      infiniteSessions: settings.infiniteSessions,
    });
  }

  function handleSend(content: string, attachments?: Attachment[]): void {
    const trimmed = content.trim();

    // Handle /fleet command — with or without trailing space
    if (trimmed === '/fleet' || trimmed.startsWith('/fleet ')) {
      const prompt = trimmed.slice(6).trim();
      if (!prompt) {
        chatStore.addUserMessage(content);
        chatStore.handleServerMessage({ type: 'error', message: 'Usage: /fleet <prompt> — describe the task for parallel agents' } as any);
        return;
      }
      chatStore.addUserMessage(content);
      wsStore.send({ type: 'start_fleet', prompt });
      return;
    }

    // Queue during streaming instead of steering immediately
    if (chatStore.isStreaming || chatStore.isWaiting) {
      chatStore.addQueuedMessage(content, attachments);
      return;
    }

    chatStore.addUserMessage(content, attachments);
    wsStore.sendMessage(content, attachments);
  }

  function handleSendQueued(id: string): void {
    const data = chatStore.sendQueuedMessage(id);
    if (data) {
      wsStore.sendMessage(data.content, data.attachments, 'immediate');
    }
  }

  function handleCancelQueued(id: string): void {
    chatStore.cancelQueuedMessage(id);
  }

  // Auto-flush queued messages when streaming ends
  $effect(() => {
    const streaming = chatStore.isStreaming;
    const waiting = chatStore.isWaiting;
    const hasQueued = chatStore.hasQueuedMessages;

    if (!streaming && !waiting && hasQueued) {
      // Use microtask to avoid acting during the reactive update
      queueMicrotask(() => {
        const data = chatStore.flushQueue();
        if (data) {
          wsStore.sendMessage(data.content, data.attachments);
        }
      });
    }
  });

  function handleNewChat(): void {
    chatStore.clearMessages();
    requestNewSession();
    sidebarOpen = false;
  }

  function handleSetMode(mode: SessionMode): void {
    wsStore.setMode(mode);
    settings.selectedMode = mode;
  }

  function handleSetModel(model: string): void {
    wsStore.setModel(model);
    settings.selectedModel = model;
  }

  function handleSetReasoning(effort: ReasoningEffort): void {
    settings.reasoningEffort = effort;
    // Persist the preference — will be applied on the next new session.
    // Do NOT restart the current session: that would wipe the chat history.
  }

  function handleLogout(): void {
    sidebarOpen = false;
    fetch('/auth/logout', { method: 'POST' }).then(() => {
      window.location.reload();
    });
  }

  function handleOpenSessions(): void {
    sidebarOpen = false;
    sessionsOpen = true;
    sessionsLoading = true;
    wsStore.listSessions();
  }

  function handleResumeSession(sessionId: string): void {
    chatStore.clearMessages();
    wsStore.resumeSession(sessionId, settings.mcpServers);
    sessionsOpen = false;
  }

  function handleOpenSettings(): void {
    sidebarOpen = false;
    settingsOpen = true;
  }

  function handleUserInputResponse(answer: string, wasFreeform: boolean): void {
    wsStore.respondToUserInput(answer, wasFreeform);
    chatStore.clearPendingUserInput();
  }

  function handlePermissionResponse(requestId: string, decision: 'allow' | 'deny' | 'always_allow'): void {
    const perm = chatStore.pendingPermissions.find((p) => p.requestId === requestId);
    const kind = perm?.kind ?? '';
    const toolName = perm?.toolName ?? '';
    wsStore.respondToPermission(requestId, kind, toolName, decision);
    chatStore.clearPendingPermission(requestId);
  }

  function handleToggleSkill(skillName: string, enabled: boolean): void {
    if (enabled) {
      settings.disabledSkills = settings.disabledSkills.filter(s => s !== skillName);
    } else {
      settings.disabledSkills = [...settings.disabledSkills, skillName];
    }
  }
</script>

<svelte:head>
  <title>{chatStore.sessionTitle ? `${chatStore.sessionTitle} — Copilot Unleashed` : 'Copilot Unleashed'}</title>
</svelte:head>

{#if data.authenticated}
  <div class="screen" style={modeStyle}>
    <TopBar
      currentModel={effectiveModel}
      connectionState={wsStore.connectionState}
      sessionTitle={chatStore.sessionTitle}
      quotaSnapshots={chatStore.quotaSnapshots}
      {activeSkillCount}
      onToggleSidebar={() => sidebarOpen = true}
      onOpenModelSheet={() => modelSheetOpen = true}
    />

    <div class="terminal">
      {#if sessionLoading}
        <div class="session-loading">
          {#each Array(3) as _, i (i)}
            <div class="loading-skeleton">
              <div class="skeleton skeleton-bar" style:width={i === 0 ? '60%' : i === 1 ? '85%' : '45%'}></div>
              <div class="skeleton skeleton-bar-sm" style:width={i === 0 ? '40%' : i === 1 ? '55%' : '30%'}></div>
            </div>
          {/each}
        </div>
      {:else}
        {#if chatStore.plan.exists}
          <PlanPanel
            plan={chatStore.plan}
            onUpdatePlan={(content) => wsStore.updatePlan(content)}
            onDeletePlan={() => wsStore.deletePlan()}
          />
        {/if}

        <MessageList {chatStore} username={data.user?.login} onSendQueued={handleSendQueued} onCancelQueued={handleCancelQueued}>
          {#if chatStore.messages.length === 0}
            <Banner username={data.user?.login} />
          {/if}
          <EnvInfo
            modelCount={modelCount}
            toolCount={toolCount}
            mcpServerCount={mcpServerCount}
            currentAgent={chatStore.currentAgent}
            sessionTitle={chatStore.sessionTitle}
            contextInfo={chatStore.contextInfo}
            sessionTotals={chatStore.sessionTotals}
          />
        </MessageList>

      {/if}

        {#if chatStore.pendingPermissions.length > 0}
          {#each chatStore.pendingPermissions as perm (perm.requestId)}
            <PermissionPrompt
              requestId={perm.requestId}
              kind={perm.kind}
              toolName={perm.toolName}
              toolArgs={perm.toolArgs}
              onRespond={handlePermissionResponse}
            />
          {/each}
        {/if}

        <ChatInput
        connectionState={wsStore.connectionState}
        sessionReady={wsStore.sessionReady}
        isStreaming={chatStore.isStreaming}
        isWaiting={chatStore.isWaiting}
        mode={chatStore.mode}
        supportsVision={supportsVision}
        pendingUserInput={chatStore.pendingUserInput}
        onSend={handleSend}
        onAbort={() => wsStore.abort()}
        onSetMode={handleSetMode}
        onUserInputResponse={handleUserInputResponse}
        onFleet={(prompt) => {
          chatStore.addUserMessage(`/fleet ${prompt}`);
          wsStore.send({ type: 'start_fleet', prompt });
        }}
        onNewChat={handleNewChat}
        onOpenModelSheet={() => { modelSheetOpen = true; }}
        onCompact={() => wsStore.compact()}
      />
    </div>

    <Sidebar
      open={sidebarOpen}
      currentAgent={chatStore.currentAgent}
      quotaSnapshots={chatStore.quotaSnapshots}
      sessionTotals={chatStore.sessionTotals}
      onClose={() => sidebarOpen = false}
      onNewChat={handleNewChat}
      onOpenSessions={handleOpenSessions}
      onOpenSettings={handleOpenSettings}
      onLogout={handleLogout}
    />

    <ModelSheet
      open={modelSheetOpen}
      models={chatStore.models}
      currentModel={effectiveModel}
      reasoningEffort={chatStore.reasoningEffort ?? settings.reasoningEffort}
      onSetModel={handleSetModel}
      onSetReasoning={handleSetReasoning}
      onClose={() => modelSheetOpen = false}
    />

    <SettingsModal
      open={settingsOpen}
      tools={chatStore.tools}
      agents={chatStore.agents}
      currentAgent={chatStore.currentAgent}
      quotaSnapshots={chatStore.quotaSnapshots}
      customInstructions={settings.customInstructions}
      excludedTools={settings.excludedTools}
      customTools={settings.customTools}
      customAgents={settings.customAgents}
      mcpServers={settings.mcpServers}
      availableSkills={settings.availableSkills}
      disabledSkills={settings.disabledSkills}
      onClose={() => settingsOpen = false}
      onSaveInstructions={(v) => { settings.customInstructions = v; }}
      onToggleTool={(name, enabled) => {
        if (enabled) {
          settings.excludedTools = settings.excludedTools.filter(t => t !== name);
        } else {
          settings.excludedTools = [...settings.excludedTools, name];
        }
      }}
      onSaveCustomTools={(tools) => { settings.customTools = tools; }}
      onSaveCustomAgents={(agents) => { settings.customAgents = agents; }}
      onSaveMcpServers={(servers) => { settings.mcpServers = servers; }}
      onToggleSkill={handleToggleSkill}
      onSelectAgent={(name) => wsStore.selectAgent(name)}
      onDeselectAgent={() => wsStore.deselectAgent()}
      onCompact={() => wsStore.compact()}
      onFetchTools={() => wsStore.listTools(chatStore.currentModel)}
      onFetchAgents={() => wsStore.listAgents()}
      onFetchQuota={() => wsStore.getQuota()}
      onFetchSkills={() => settings.fetchSkills()}
      notificationsEnabled={settings.notificationsEnabled}
      onToggleNotifications={(v) => { settings.notificationsEnabled = v; }}
    />

    <SessionsSheet
      open={sessionsOpen}
      sessions={chatStore.sessions}
      sessionDetail={chatStore.sessionDetail}
      loading={sessionsLoading}
      onClose={() => sessionsOpen = false}
      onResume={handleResumeSession}
      onDelete={(id) => wsStore.deleteSession(id)}
      onRequestDetail={(id) => wsStore.getSessionDetail(id)}
    />
  </div>
{:else}
  <DeviceFlowLogin />
{/if}

<style>
  .screen {
    height: 100dvh;
    height: var(--vh, 100dvh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .terminal {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: var(--sp-3) var(--sp-4);
    min-height: 0;
    overflow: hidden;
  }

  @media (min-width: 600px) {
    .terminal {
      padding: var(--sp-4) var(--sp-5);
    }
  }

  @media (min-width: 768px) {
    .terminal {
      max-width: 800px;
      margin: 0 auto;
      padding: var(--sp-4) var(--sp-6);
      width: 100%;
    }
  }

  @media (min-width: 1024px) {
    .terminal {
      max-width: 880px;
    }
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .terminal { padding: var(--sp-1) var(--sp-3); }
  }

  /* ── Session loading skeleton ──────────────────────────────────────── */
  .session-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-4) 0;
    max-width: 92%;
  }

  .loading-skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: var(--sp-2) var(--sp-3);
    border-left: 3px solid var(--border);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  .skeleton-bar {
    height: 14px;
  }

  .skeleton-bar-sm {
    height: 10px;
  }
</style>
