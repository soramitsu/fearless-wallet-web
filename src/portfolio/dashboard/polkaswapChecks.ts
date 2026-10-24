import { FPNumber } from '@sora-substrate/util';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import type { MutableAction } from '@extension-base/services/action-capability-service';
import type { TokenGroup } from '@extension-base/background/types/types';
import { getPolkaswapCapabilityReasons, type PolkaswapCapabilityReason } from '@/defi/polkaswapCapability';

/** What the wallet in use says about Polkaswap; the swap screen derives the same facts (src/screens/polkaswap/swap/SwapForm.vue). */
export interface PolkaswapWalletFacts {
  hasSoraAccount: boolean;
  signable: boolean;
  runtimeAvailable: boolean;
  usableAssets: boolean;
  disclaimerAccepted: boolean;
}

export type PolkaswapCheckId = 'account' | 'moves' | 'swaps' | 'disclaimer';

/** `null` is not known: the wallet is not the selected one, or release policy has not loaded. */
export interface PolkaswapCheck {
  id: PolkaswapCheckId;
  ok: boolean | null;
}

export interface PolkaswapChecks {
  checks: PolkaswapCheck[];
  /** What keeps the swap screen from working. The disclaimer is not one: the swap screen asks for it. */
  blockers: PolkaswapCapabilityReason[];
}

const MOVE_ACTIONS: readonly MutableAction[] = ['crossChainXcm', 'crossChainSoraBridge', 'crossChainLiberland'];

/**
 * The checks behind a swap on Polkaswap, as the card shows them: a SORA account in this wallet that can sign, swaps
 * on, the disclaimer accepted, and whether cross-network moves are on or off. Release policy and the wallet in use
 * decide; nothing here asks the network.
 */
export function polkaswapChecks({
  facts,
  actions,
}: {
  facts: PolkaswapWalletFacts | undefined;
  actions: Partial<Record<MutableAction, boolean>> | undefined;
}): PolkaswapChecks {
  const swaps = actions ? actions.polkaswap === true : null;
  const moves = actions ? MOVE_ACTIONS.some((action) => actions[action] === true) : null;
  const blockers =
    facts && actions
      ? getPolkaswapCapabilityReasons({ ...facts, actionEnabled: swaps === true }).filter((reason) => reason !== 'disclaimer')
      : [];

  return {
    checks: [
      { id: 'account', ok: facts ? facts.hasSoraAccount && facts.signable : null },
      { id: 'moves', ok: moves },
      { id: 'swaps', ok: swaps },
      { id: 'disclaimer', ok: facts ? facts.disclaimerAccepted : null },
    ],
    blockers,
  };
}

/**
 * The facts the swap screen reads about the selected wallet, derived the way `SwapForm.vue` derives them: a SORA account
 * is a wallet with SORA balance rows, it must not be watch-only, hardware or external, SORA must be connected, and a
 * swap needs XOR to pay the fee, a positive balance and a second SORA asset. Keep the two in step.
 */
export function derivePolkaswapFacts({
  account,
  balances,
  soraNetwork,
  soraNetworkName,
  soraXorAssetId,
  showDisclaimer,
}: {
  /** The wallet's account; only whether it is watch-only, injected or hardware matters here. */
  account: Record<string, unknown> | undefined;
  balances: readonly Pick<TokenGroup, 'balances'>[];
  soraNetwork: { disabled?: boolean; active?: boolean; networkStatus?: string } | undefined;
  soraNetworkName: string;
  soraXorAssetId: string;
  /** `accountsStore.showPolkaswapAlert`: the disclaimer has not been accepted yet. */
  showDisclaimer: boolean;
}): PolkaswapWalletFacts {
  const name = soraNetworkName.toLowerCase();
  const onSora = (balanceName: string): boolean => balanceName.toLowerCase() === name;
  const soraCurrencies = balances.filter((group) => group.balances.some((balance) => onSora(balance.name)));
  const xorGroup = soraCurrencies.find((group) =>
    group.balances.some(
      (balance) => onSora(balance.name) && (balance.isUtility || balance.id.toLowerCase() === soraXorAssetId.toLowerCase())
    )
  );
  const positive = (value: string | undefined): boolean => new FPNumber(value ?? '0').isGreaterThan(FPNumber.ZERO);
  const hasXorForFees = positive(xorGroup?.balances.find((balance) => onSora(balance.name))?.transferable);
  const hasPositiveAsset = soraCurrencies.some((group) => positive(group.balances.find((balance) => onSora(balance.name))?.transferable));
  const hasSoraAccount = Boolean(account && soraCurrencies.length);

  return {
    hasSoraAccount,
    signable: hasSoraAccount ? !(account?.isExternal || account?.isInjected || account?.isHardware) : false,
    runtimeAvailable: Boolean(
      soraNetwork && !soraNetwork.disabled && soraNetwork.active && soraNetwork.networkStatus !== NETWORK_STATUS.DISCONNECTED
    ),
    usableAssets: soraCurrencies.length >= 2 && hasXorForFees && hasPositiveAsset,
    disclaimerAccepted: !showDisclaimer,
  };
}
