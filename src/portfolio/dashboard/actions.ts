import type { PolkaswapCapabilityReason } from '@/defi/polkaswapCapability';
import type { Readiness } from '@/portfolio/dashboard/readiness';

export type ActionId = 'swap' | 'move' | 'send' | 'receive' | 'receiveOnSora';

/** Why an action is not available; it is always said next to the action (spec 4.4: "each with a reason when unavailable"). */
export type ActionBlock = 'moves-off' | 'swaps-off' | 'send-off' | PolkaswapCapabilityReason;

export interface LocationAction {
  id: ActionId;
  enabled: boolean;
  blocked?: ActionBlock;
  /** The holding is in a wallet that is not the selected one: acting switches to that wallet first. */
  switchFirst: boolean;
}

export interface LocationActions {
  primary: LocationAction;
  /** At most two. */
  secondary: LocationAction[];
}

export interface ActionContext {
  readiness: Readiness;
  /** The holding's wallet is not the selected one. */
  switchFirst: boolean;
  /** Transfers are allowed on the holding's network (the send kill switch and release policy). */
  canSend: boolean;
  /** Known only for the selected wallet; they decide whether the swap screen can work. */
  swapBlockers: readonly PolkaswapCapabilityReason[];
}

/**
 * The actions of one holding: one primary and two secondary (design spec 4.4), chosen by how the holding stands to a
 * swap (spec 4.5). The dashboard only hands over to a screen that already exists; an action that is not available says
 * why instead of disappearing, so nothing is hidden.
 */
export function locationActions({ readiness, switchFirst, canSend, swapBlockers }: ActionContext): LocationActions {
  const action = (id: ActionId, enabled = true, blocked?: ActionBlock): LocationAction => ({
    id,
    enabled,
    ...(enabled || !blocked ? {} : { blocked }),
    switchFirst,
  });
  const send = action('send', canSend, canSend ? undefined : 'send-off');
  const receive = action('receive');
  const receiveOnSora = readiness.soraAssetId ? [action('receiveOnSora')] : [];
  const secondary = (...actions: LocationAction[]): LocationAction[] => actions.slice(0, 2);

  switch (readiness.state) {
    case 'ready':
      return {
        primary: action('swap', swapBlockers.length === 0, swapBlockers[0]),
        secondary: secondary(send, receive),
      };
    case 'route':
      return { primary: action('move'), secondary: secondary(send, receive) };
    case 'off':
      return {
        primary:
          readiness.cause === 'swaps-off' ? action('swap', false, 'swaps-off') : action('move', false, 'moves-off'),
        secondary: secondary(...receiveOnSora, send, receive),
      };
    default:
      return { primary: send, secondary: secondary(receive) };
  }
}
