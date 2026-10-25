import type { RouteLocationNormalizedLoaded, RouteLocationRaw, Router } from 'vue-router';

export type PrimaryDestination = 'portfolio' | 'defi' | 'polkaswap' | 'cross-chain' | 'settings';

type StackEntry = {
  fullPath: string;
  route: RouteLocationRaw;
};

type ObservedRoute = StackEntry & { destination: PrimaryDestination };

const stacks = new Map<string, Map<PrimaryDestination, StackEntry[]>>();
const lastObserved = new Map<string, ObservedRoute>();
const scopeKey = (walletAddress: string): string => walletAddress || 'anonymous';

const rawRoute = (route: RouteLocationNormalizedLoaded): RouteLocationRaw => ({
  name: route.name ?? undefined,
  params: { ...route.params },
  query: { ...route.query },
  hash: route.hash,
});

function walletStacks(walletAddress: string): Map<PrimaryDestination, StackEntry[]> {
  const scope = scopeKey(walletAddress);
  const result = stacks.get(scope) ?? new Map<PrimaryDestination, StackEntry[]>();
  stacks.set(scope, result);
  return result;
}

/** Records push, restore, and browser-pop transitions into the active tab only. */
export function rememberPrimaryRoute(walletAddress: string, route: RouteLocationNormalizedLoaded): void {
  const destination = route.meta.primaryNavigation as PrimaryDestination | undefined;
  if (!destination || !route.name) return;

  const scope = scopeKey(walletAddress);
  const entry = { fullPath: route.fullPath, route: rawRoute(route) };
  const destinationStacks = walletStacks(walletAddress);
  const stack = destinationStacks.get(destination) ?? [];
  const previous = lastObserved.get(scope);
  const top = stack.at(-1);

  if (!top) {
    stack.push(entry);
  } else if (top.fullPath !== entry.fullPath) {
    const existingIndex = stack.findIndex(({ fullPath }) => fullPath === entry.fullPath);

    if (previous?.destination === destination && existingIndex >= 0) {
      // A native/app back transition within the current destination.
      stack.splice(existingIndex + 1);
    } else if (previous?.destination !== destination && existingIndex >= 0) {
      // Switching tabs restores its existing top without altering its stack.
      if (existingIndex !== stack.length - 1) stack.splice(existingIndex + 1);
    } else {
      stack.push(entry);
    }
  }

  destinationStacks.set(destination, stack);
  lastObserved.set(scope, { ...entry, destination });
}

export function getRememberedPrimaryRoute(
  walletAddress: string,
  destination: PrimaryDestination
): RouteLocationRaw | undefined {
  return stacks.get(scopeKey(walletAddress))?.get(destination)?.at(-1)?.route;
}

export function getPrimaryStack(walletAddress: string, destination: PrimaryDestination): RouteLocationRaw[] {
  return (stacks.get(scopeKey(walletAddress))?.get(destination) ?? []).map(({ route }) => route);
}

export function popPrimaryRoute(
  walletAddress: string,
  destination: PrimaryDestination
): RouteLocationRaw | undefined {
  const stack = stacks.get(scopeKey(walletAddress))?.get(destination);
  if (!stack?.length) return undefined;
  if (stack.length > 1) stack.pop();
  return stack.at(-1)?.route;
}

export function resetPrimaryDestination(walletAddress: string, destination: PrimaryDestination): void {
  stacks.get(scopeKey(walletAddress))?.delete(destination);
}

export function resolvePrimaryNavigationTarget(
  walletAddress: string,
  active: PrimaryDestination,
  destination: PrimaryDestination,
  root: RouteLocationRaw
): RouteLocationRaw {
  if (active === destination) return root;
  return getRememberedPrimaryRoute(walletAddress, destination) ?? root;
}

export function resolvePrimaryBackTarget(
  walletAddress: string,
  route: RouteLocationNormalizedLoaded,
  root: RouteLocationRaw
): RouteLocationRaw {
  const destination = route.meta.primaryNavigation as PrimaryDestination | undefined;
  if (!destination) return root;
  return popPrimaryRoute(walletAddress, destination) ?? root;
}

const primaryRoots: Record<PrimaryDestination, RouteLocationRaw> = {
  portfolio: { name: 'Wallet' },
  defi: { name: 'Defi' },
  polkaswap: { name: 'Polkaswap' },
  'cross-chain': { name: 'CrossChain' },
  settings: { name: 'Settings' },
};

export function navigatePrimaryBack(
  router: Router,
  walletAddress: string,
  route: RouteLocationNormalizedLoaded
): ReturnType<Router['replace']> | void {
  const destination = route.meta.primaryNavigation as PrimaryDestination | undefined;
  if (!destination) {
    router.back();
    return;
  }

  return router.replace(resolvePrimaryBackTarget(walletAddress, route, primaryRoots[destination]));
}

export function clearRememberedPrimaryRoutes(): void {
  stacks.clear();
  lastObserved.clear();
}
