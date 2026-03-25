<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { registerServiceWorker } from '$lib/utils/sw-register.js';

  let { children } = $props();

  onMount(() => {
    registerServiceWorker();
  });
</script>

{@render children()}
