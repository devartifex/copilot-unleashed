<script lang="ts">
  import { Eye, EyeOff } from 'lucide-svelte';

  interface ProviderInfo {
    type?: string;
    baseUrl?: string;
    wireApi?: string;
    hasApiKey?: boolean;
    hasBearerToken?: boolean;
    azure?: { apiVersion?: string };
  }

  interface ProviderPayload {
    type?: string;
    baseUrl: string;
    apiKey?: string;
    bearerToken?: string;
    wireApi?: string;
    azure?: { apiVersion?: string };
  }

  interface Props {
    loading?: boolean;
    provider: ProviderInfo | null;
    onSave: (config: ProviderPayload) => Promise<void> | void;
    onDelete: () => Promise<void> | void;
  }

  const { loading = false, provider, onSave, onDelete }: Props = $props();

  const providerTypes = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'azure', label: 'Azure' },
    { value: 'anthropic', label: 'Anthropic' },
  ] as const;

  const wireApiOptions = [
    { value: 'completions', label: 'Completions' },
    { value: 'responses', label: 'Responses' },
  ] as const;

  let type = $state('openai');
  let baseUrl = $state('');
  let apiKey = $state('');
  let bearerToken = $state('');
  let wireApi = $state('completions');
  let azureApiVersion = $state('');
  let showApiKey = $state(false);
  let showBearerToken = $state(false);
  let saving = $state(false);
  let deleting = $state(false);

  // Sync from provider prop when it changes (e.g. after fetch)
  $effect(() => {
    type = provider?.type ?? 'openai';
    baseUrl = provider?.baseUrl ?? '';
    wireApi = provider?.wireApi ?? 'completions';
    azureApiVersion = provider?.azure?.apiVersion ?? '';
  });

  const isConfigured = $derived(provider !== null);
  const showWireApi = $derived(type === 'openai' || type === 'azure');
  const showAzure = $derived(type === 'azure');
  const canSave = $derived(baseUrl.trim().length > 0 && !saving);

  // Sync form fields when provider prop changes
  $effect(() => {
    if (provider) {
      type = provider.type ?? 'openai';
      baseUrl = provider.baseUrl ?? '';
      wireApi = provider.wireApi ?? 'completions';
      azureApiVersion = provider.azure?.apiVersion ?? '';
    }
  });

  async function handleSave() {
    if (!canSave) return;
    saving = true;
    try {
      const config: ProviderPayload = {
        type,
        baseUrl: baseUrl.trim(),
      };
      if (apiKey.trim()) config.apiKey = apiKey.trim();
      if (bearerToken.trim()) config.bearerToken = bearerToken.trim();
      if (showWireApi) config.wireApi = wireApi;
      if (showAzure && azureApiVersion.trim()) {
        config.azure = { apiVersion: azureApiVersion.trim() };
      }
      await onSave(config);
      apiKey = '';
      bearerToken = '';
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    deleting = true;
    try {
      await onDelete();
      baseUrl = '';
      apiKey = '';
      bearerToken = '';
      azureApiVersion = '';
      type = 'openai';
      wireApi = 'completions';
    } finally {
      deleting = false;
    }
  }
</script>

<p class="settings-hint">
  Connect your own AI provider (OpenAI-compatible, Azure, or Anthropic). API keys are encrypted at rest.
</p>

{#if loading}
  <div class="skeleton-list">
    <div class="skeleton skeleton-row"></div>
    <div class="skeleton skeleton-row"></div>
  </div>
{:else}
  {#if isConfigured}
    <div class="status-badge status-configured">
      <span class="status-dot"></span>
      Provider configured
      {#if provider?.type}
        <span class="status-type">({provider.type})</span>
      {/if}
    </div>
  {:else}
    <div class="status-badge status-none">
      <span class="status-dot status-dot-none"></span>
      No provider configured
    </div>
  {/if}

  <div class="byok-form">
    <!-- Provider Type -->
    <label class="field-label" for="byok-type">Provider Type</label>
    <select id="byok-type" class="field-select" bind:value={type}>
      {#each providerTypes as pt (pt.value)}
        <option value={pt.value}>{pt.label}</option>
      {/each}
    </select>

    <!-- Base URL -->
    <label class="field-label" for="byok-base-url">
      Base URL <span class="field-required">*</span>
    </label>
    <input
      id="byok-base-url"
      class="field-input"
      type="url"
      placeholder="https://api.example.com/v1"
      bind:value={baseUrl}
      required
    />

    <!-- API Key -->
    <label class="field-label" for="byok-api-key">API Key</label>
    {#if provider?.hasApiKey}
      <p class="field-saved">API key saved ✓</p>
    {/if}
    <div class="field-password-wrap">
      <input
        id="byok-api-key"
        class="field-input field-input-secret"
        type={showApiKey ? 'text' : 'password'}
        placeholder={provider?.hasApiKey ? 'Enter new key to replace' : 'sk-…'}
        bind:value={apiKey}
        autocomplete="off"
      />
      <button
        class="field-toggle-vis"
        type="button"
        onclick={() => (showApiKey = !showApiKey)}
        aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
      >
        {#if showApiKey}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
      </button>
    </div>

    <!-- Bearer Token -->
    <label class="field-label" for="byok-bearer">Bearer Token</label>
    {#if provider?.hasBearerToken}
      <p class="field-saved">Bearer token saved ✓</p>
    {/if}
    <div class="field-password-wrap">
      <input
        id="byok-bearer"
        class="field-input field-input-secret"
        type={showBearerToken ? 'text' : 'password'}
        placeholder={provider?.hasBearerToken ? 'Enter new token to replace' : 'Token…'}
        bind:value={bearerToken}
        autocomplete="off"
      />
      <button
        class="field-toggle-vis"
        type="button"
        onclick={() => (showBearerToken = !showBearerToken)}
        aria-label={showBearerToken ? 'Hide bearer token' : 'Show bearer token'}
      >
        {#if showBearerToken}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
      </button>
    </div>

    <!-- Wire API (OpenAI / Azure only) -->
    {#if showWireApi}
      <label class="field-label" for="byok-wire-api">Wire API</label>
      <select id="byok-wire-api" class="field-select" bind:value={wireApi}>
        {#each wireApiOptions as wo (wo.value)}
          <option value={wo.value}>{wo.label}</option>
        {/each}
      </select>
    {/if}

    <!-- Azure API Version (Azure only) -->
    {#if showAzure}
      <label class="field-label" for="byok-azure-ver">Azure API Version</label>
      <input
        id="byok-azure-ver"
        class="field-input"
        type="text"
        placeholder="2024-02-15-preview"
        bind:value={azureApiVersion}
      />
    {/if}

    <!-- Actions -->
    <div class="byok-actions">
      <button class="action-btn action-save" onclick={handleSave} disabled={!canSave}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      {#if isConfigured}
        <button class="action-btn action-delete" onclick={handleDelete} disabled={deleting}>
          {deleting ? 'Removing…' : 'Remove Provider'}
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .settings-hint {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    margin-bottom: var(--sp-2);
    line-height: 1.5;
  }
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-1) 0;
  }
  .skeleton-row {
    height: 28px;
    width: 100%;
  }
  .status-badge {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    font-family: var(--font-mono);
    font-size: 0.75em;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--radius-sm);
    margin-bottom: var(--sp-2);
  }
  .status-configured {
    color: var(--green, #3fb950);
    background: rgba(63, 185, 80, 0.1);
  }
  .status-none {
    color: var(--fg-dim);
    background: var(--bg-2, rgba(48, 54, 61, 0.3));
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green, #3fb950);
    flex-shrink: 0;
  }
  .status-dot-none {
    background: var(--fg-dim);
  }
  .status-type {
    opacity: 0.7;
  }
  .byok-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }
  .field-label {
    font-family: var(--font-mono);
    font-size: 0.72em;
    color: var(--fg-dim);
    margin-top: var(--sp-1);
  }
  .field-required {
    color: var(--accent, #f78166);
  }
  .field-input,
  .field-select {
    font-family: var(--font-mono);
    font-size: 0.82em;
    color: var(--fg);
    background: var(--bg-2, rgba(48, 54, 61, 0.3));
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--sp-1) var(--sp-2);
    width: 100%;
    box-sizing: border-box;
  }
  .field-input::placeholder {
    color: var(--fg-dim);
    opacity: 0.5;
  }
  .field-input:focus,
  .field-select:focus {
    outline: none;
    border-color: var(--accent, #f78166);
  }
  .field-select {
    cursor: pointer;
    appearance: auto;
  }
  .field-saved {
    font-family: var(--font-mono);
    font-size: 0.7em;
    color: var(--green, #3fb950);
    margin: 0;
  }
  .field-password-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .field-input-secret {
    padding-right: calc(var(--sp-2) + 24px);
  }
  .field-toggle-vis {
    position: absolute;
    right: var(--sp-1);
    background: none;
    border: none;
    color: var(--fg-dim);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .field-toggle-vis:hover {
    color: var(--fg);
  }
  .byok-actions {
    display: flex;
    gap: var(--sp-2);
    margin-top: var(--sp-2);
    flex-wrap: wrap;
  }
  .action-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 100px;
    color: var(--fg-dim);
    padding: var(--sp-1) var(--sp-2);
    font-family: var(--font-mono);
    font-size: 0.9em;
    cursor: pointer;
    white-space: nowrap;
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }
  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .action-save {
    border-color: var(--accent, #f78166);
    color: var(--accent, #f78166);
  }
  .action-delete {
    border-color: var(--red, #f85149);
    color: var(--red, #f85149);
  }
</style>
