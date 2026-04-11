<script lang="ts">
  interface SchemaProperty {
    type?: string;
    description?: string;
    enum?: string[];
    default?: unknown;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
  }

  interface Props {
    elicitationId?: string;
    message?: string;
    requestedSchema?: {
      type?: string;
      properties?: Record<string, SchemaProperty>;
      required?: string[];
    };
    mode?: string;
    elicitationSource?: string;
    onRespond: (response: { action: 'accept' | 'decline' | 'cancel'; elicitationId?: string; content?: Record<string, unknown> }) => void;
  }

  const { elicitationId, message, requestedSchema, mode, elicitationSource, onRespond }: Props = $props();

  let formValues = $state<Record<string, unknown>>({});
  let validationErrors = $state<Record<string, string>>({});
  let dialogEl: HTMLDivElement | undefined = $state();

  const properties = $derived(requestedSchema?.properties ?? {});
  const fieldNames = $derived(Object.keys(properties));
  const requiredFields = $derived(new Set(requestedSchema?.required ?? []));

  // Initialize defaults
  $effect(() => {
    const initial: Record<string, unknown> = {};
    for (const [name, schema] of Object.entries(properties)) {
      if (schema.default !== undefined) {
        initial[name] = schema.default;
      } else if (schema.type === 'boolean') {
        initial[name] = false;
      } else {
        initial[name] = '';
      }
    }
    formValues = initial;
  });

  $effect(() => {
    if (dialogEl) {
      dialogEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Focus the first input
      const firstInput = dialogEl.querySelector<HTMLElement>('input, select, textarea');
      firstInput?.focus();
    }
  });

  function validate(): boolean {
    const errors: Record<string, string> = {};
    for (const name of fieldNames) {
      const schema = properties[name];
      const value = formValues[name];
      const isRequired = requiredFields.has(name);

      if (isRequired) {
        if (value === '' || value === undefined || value === null) {
          errors[name] = 'This field is required';
          continue;
        }
      }

      if (schema.type === 'string' && typeof value === 'string' && value.length > 0) {
        if (schema.minLength !== undefined && value.length < schema.minLength) {
          errors[name] = `Minimum ${schema.minLength} characters`;
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
          errors[name] = `Maximum ${schema.maxLength} characters`;
        }
      }

      if (schema.type === 'number' && value !== '' && value !== undefined) {
        const num = Number(value);
        if (isNaN(num)) {
          errors[name] = 'Must be a number';
        } else {
          if (schema.minimum !== undefined && num < schema.minimum) {
            errors[name] = `Minimum value is ${schema.minimum}`;
          }
          if (schema.maximum !== undefined && num > schema.maximum) {
            errors[name] = `Maximum value is ${schema.maximum}`;
          }
        }
      }
    }
    validationErrors = errors;
    return Object.keys(errors).length === 0;
  }

  function handleAccept(): void {
    if (!validate()) return;

    // Coerce values to proper types
    const content: Record<string, unknown> = {};
    for (const [name, schema] of Object.entries(properties)) {
      const value = formValues[name];
      if (schema.type === 'number' && value !== '' && value !== undefined) {
        content[name] = Number(value);
      } else if (schema.type === 'boolean') {
        content[name] = Boolean(value);
      } else {
        content[name] = value;
      }
    }
    onRespond({ action: 'accept', elicitationId, content });
  }

  function handleDecline(): void {
    onRespond({ action: 'decline', elicitationId });
  }

  function handleCancel(): void {
    onRespond({ action: 'cancel', elicitationId });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }
  }

  function formatFieldLabel(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_interactive_supports_focus -->
<div
  class="elicitation-overlay"
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={message ?? 'Provide information'}
  onkeydown={handleKeydown}
>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="elicitation-backdrop" role="presentation" onclick={handleCancel}></div>

  <div class="elicitation-card" bind:this={dialogEl}>
    {#if elicitationSource}
      <span class="elicitation-source">{elicitationSource}</span>
    {/if}

    {#if message}
      {#if mode === 'url'}
        <p class="elicitation-message">
          <a href={message} target="_blank" rel="noopener noreferrer" class="elicitation-link">{message}</a>
        </p>
      {:else}
        <p class="elicitation-message">{message}</p>
      {/if}
    {/if}

    {#if fieldNames.length > 0}
      <form
        class="elicitation-form"
        onsubmit={(e) => { e.preventDefault(); handleAccept(); }}
      >
        {#each fieldNames as name (name)}
          {@const schema = properties[name]}
          {@const isRequired = requiredFields.has(name)}
          {@const error = validationErrors[name]}
          {@const fieldId = `elicitation-${name}`}

          <div class="elicitation-field" class:has-error={!!error}>
            <label for={fieldId} class="elicitation-label">
              {formatFieldLabel(name)}{#if isRequired}<span class="required-mark" aria-label="required">*</span>{/if}
            </label>

            {#if schema.description}
              <p class="elicitation-description" id="{fieldId}-desc">{schema.description}</p>
            {/if}

            {#if schema.enum && schema.enum.length > 0}
              <select
                id={fieldId}
                class="elicitation-input"
                aria-describedby={schema.description ? `${fieldId}-desc` : undefined}
                aria-invalid={!!error}
                aria-required={isRequired}
                onchange={(e) => { formValues[name] = e.currentTarget.value; }}
                value={String(formValues[name] ?? '')}
              >
                <option value="" disabled>Select…</option>
                {#each schema.enum as option (option)}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            {:else if schema.type === 'boolean'}
              <label class="elicitation-toggle-label">
                <input
                  id={fieldId}
                  type="checkbox"
                  class="elicitation-checkbox"
                  aria-describedby={schema.description ? `${fieldId}-desc` : undefined}
                  checked={!!formValues[name]}
                  onchange={(e) => { formValues[name] = e.currentTarget.checked; }}
                />
                <span class="elicitation-toggle-text">{formValues[name] ? 'Yes' : 'No'}</span>
              </label>
            {:else if schema.type === 'number'}
              <input
                id={fieldId}
                type="number"
                class="elicitation-input"
                aria-describedby={schema.description ? `${fieldId}-desc` : undefined}
                aria-invalid={!!error}
                aria-required={isRequired}
                min={schema.minimum}
                max={schema.maximum}
                value={formValues[name] !== undefined ? String(formValues[name]) : ''}
                oninput={(e) => { formValues[name] = e.currentTarget.value; }}
              />
            {:else}
              <input
                id={fieldId}
                type="text"
                class="elicitation-input"
                aria-describedby={schema.description ? `${fieldId}-desc` : undefined}
                aria-invalid={!!error}
                aria-required={isRequired}
                minlength={schema.minLength}
                maxlength={schema.maxLength}
                value={String(formValues[name] ?? '')}
                oninput={(e) => { formValues[name] = e.currentTarget.value; }}
              />
            {/if}

            {#if error}
              <p class="elicitation-error" role="alert">{error}</p>
            {/if}
          </div>
        {/each}
      </form>
    {/if}

    <div class="elicitation-actions">
      <button class="elicitation-btn accept" onclick={handleAccept}>Accept</button>
      <button class="elicitation-btn decline" onclick={handleDecline}>Decline</button>
      <button class="elicitation-btn cancel" onclick={handleCancel}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .elicitation-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-4);
    animation: elicitation-fade-in 0.2s ease;
  }

  @keyframes elicitation-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .elicitation-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(2px);
  }

  .elicitation-card {
    position: relative;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--sp-5);
    width: 100%;
    max-width: 480px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px var(--shadow);
    animation: elicitation-slide-in 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes elicitation-slide-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .elicitation-source {
    display: inline-block;
    background: rgba(110, 64, 201, 0.15);
    color: var(--purple);
    font-weight: 600;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    padding: 2px 8px;
    border-radius: 100px;
    margin-bottom: var(--sp-2);
  }

  .elicitation-message {
    color: var(--fg);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
    margin-bottom: var(--sp-4);
  }

  .elicitation-link {
    color: var(--accent, #58a6ff);
    text-decoration: underline;
    word-break: break-all;
  }

  .elicitation-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-bottom: var(--sp-4);
  }

  .elicitation-field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .elicitation-label {
    color: var(--fg);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .required-mark {
    color: var(--red);
    margin-left: 2px;
  }

  .elicitation-description {
    color: var(--fg-dim);
    font-size: var(--text-xs);
    line-height: var(--leading-tight);
  }

  .elicitation-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    padding: var(--sp-2) var(--sp-3);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    outline: none;
    transition: border-color 0.15s ease;
    width: 100%;
  }

  .elicitation-input:focus {
    border-color: var(--purple);
  }

  .has-error .elicitation-input {
    border-color: var(--red);
  }

  select.elicitation-input {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%239ca3af' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: var(--sp-6);
    cursor: pointer;
  }

  .elicitation-toggle-label {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    cursor: pointer;
  }

  .elicitation-checkbox {
    width: 16px;
    height: 16px;
    accent-color: var(--purple);
    cursor: pointer;
  }

  .elicitation-toggle-text {
    color: var(--fg-muted);
    font-size: var(--text-sm);
    font-family: var(--font-mono);
  }

  .elicitation-error {
    color: var(--red);
    font-size: var(--text-xs);
  }

  .elicitation-actions {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }

  .elicitation-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 100px;
    color: var(--fg);
    padding: var(--sp-2) var(--sp-4);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .elicitation-btn:focus-visible {
    outline: 2px solid var(--purple);
    outline-offset: 2px;
  }

  .elicitation-btn.accept {
    border-color: var(--green);
    color: var(--green);
  }

  .elicitation-btn.accept:hover {
    background: rgba(63, 185, 80, 0.1);
  }

  .elicitation-btn.decline {
    border-color: var(--yellow);
    color: var(--yellow);
  }

  .elicitation-btn.decline:hover {
    background: rgba(227, 179, 65, 0.1);
  }

  .elicitation-btn.cancel {
    border-color: var(--fg-dim);
    color: var(--fg-dim);
  }

  .elicitation-btn.cancel:hover {
    background: rgba(132, 141, 151, 0.1);
  }
</style>
