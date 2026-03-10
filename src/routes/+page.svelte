<script lang="ts">
  import DeviceFlowLogin from '$lib/components/DeviceFlowLogin.svelte';

  let { data } = $props();
</script>

{#if data.authenticated}
  <div class="screen">
    <div class="chat-placeholder">
      <p>Chat screen — loading...</p>
    </div>
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
  }

  .chat-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--fg-muted);
    font-size: 0.9em;
  }
</style>
