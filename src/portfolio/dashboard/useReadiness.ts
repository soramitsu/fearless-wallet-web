import { computed } from 'vue';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { createReadinessEvaluator, type Readiness, type ReadinessSubject } from '@/portfolio/dashboard/readiness';
import { useExtensionStore } from '@/stores/extension';
import { useNetworksStore } from '@/stores/networks';

/**
 * How holdings stand to a swap on Polkaswap, from the registry the popup loaded and the release policy the background
 * resolved. It asks the app's own reviewed routes and says nothing until policy has loaded.
 */
export function useReadiness() {
  const extensionStore = useExtensionStore();
  const networksStore = useNetworksStore();
  const actions = computed(() => extensionStore.features?.actions);

  // One evaluator, and the answers it has given, per registry and policy; both are replaced when either changes.
  const evaluator = computed(() => ({
    ask: createReadinessEvaluator({ networks: networksStore.allNetworks, actions: actions.value, soraNetworkName: SORA_NETWORK_NAME }),
    answers: new Map<string, Readiness>(),
  }));

  /** The same for every wallet: it depends on the asset and the network, not on who holds it. */
  const readinessOf = (holding: ReadinessSubject): Readiness => {
    const { ask, answers } = evaluator.value;
    const cached = answers.get(holding.key);

    if (cached) return cached;

    const readiness = ask(holding);

    answers.set(holding.key, readiness);

    return readiness;
  };

  return { actions, readinessOf };
}
