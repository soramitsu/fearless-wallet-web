import { map } from 'rxjs';
import { u8aToHex } from '@polkadot/util';

import type { Observable } from 'rxjs';
import type { ApiPromise, ApiRx } from '@polkadot/api';
import type { Codec } from '@polkadot/types/types';
import type { CodecString } from '@sora/math';
import type { OptionLike } from '@sora-types';
import type { GenericNetworkId } from '../types/primitives';

import { toAssetId } from '../assets';

import { BridgeTxStatus, BridgeTxDirection, BridgeNetworkType } from './consts';

import type { BridgeNetworkId, BridgeTransactionData } from './types';
import type { SubNetwork, ParachainIds } from './sub/types';

type CodecNumberLike = {
  toNumber(): number;
};

type CodecStringLike = {
  toString(): string;
};

export type BridgeTypesGenericNetworkId = Codec & {
  readonly isSub?: boolean;
  readonly isEvm?: boolean;
  readonly isEvmLegacy?: boolean;
  asEvmLegacy?: CodecNumberLike;
  asEvm?: CodecStringLike;
  asSub?: CodecStringLike;
};

type Junction = {
  readonly isAccountId32?: boolean;
  readonly isAccountKey20?: boolean;
  readonly isParachain?: boolean;
  asAccountId32: { id: CodecStringLike };
  asAccountKey20: { key: Uint8Array };
  asParachain?: CodecNumberLike;
};

type ParachainInterior = {
  readonly isX1?: boolean;
  readonly isX2?: boolean;
  asX1: Junction;
  asX2: [unknown, Junction];
};

type ParachainVersioned = {
  readonly isV3?: boolean;
  asV3: { interior: ParachainInterior };
  asV2: { interior: ParachainInterior };
};

type BridgeTypesGenericAccount = {
  readonly isUnknown?: boolean;
  readonly isEvm?: boolean;
  readonly isSora?: boolean;
  readonly isParachain?: boolean;
  readonly isLiberland?: boolean;
  asEvm?: CodecStringLike;
  asSora?: { toString(): string; toNumber(): number };
  asParachain: ParachainVersioned;
  asLiberland?: CodecStringLike;
};

type BridgeTypesGenericTimepoint = {
  readonly isEvm?: boolean;
  readonly isSub?: boolean;
  readonly isSora?: boolean;
  readonly isParachain?: boolean;
  asEvm?: CodecNumberLike;
  asSub?: CodecNumberLike;
  asSora?: CodecNumberLike;
  asParachain?: CodecNumberLike;
};

type BridgeProxyBridgeRequest = {
  direction: {
    readonly isInbound: boolean;
  };
  source: BridgeTypesGenericAccount;
  dest: BridgeTypesGenericAccount;
  amount: CodecStringLike;
  assetId: unknown;
  status: {
    readonly isFailed?: boolean;
    readonly isRefunded?: boolean;
    readonly isDone?: boolean;
    readonly isCommitted?: boolean;
  };
  startTimepoint: BridgeTypesGenericTimepoint;
  endTimepoint: BridgeTypesGenericTimepoint;
};
type BridgeProxyBridgeRequestOption = OptionLike<BridgeProxyBridgeRequest>;

const isBridgeRequestOption = (value: unknown): value is BridgeProxyBridgeRequestOption =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as BridgeProxyBridgeRequestOption).unwrap === 'function' &&
  typeof (value as BridgeProxyBridgeRequestOption).toString === 'function';

const toBridgeRequestOption = (value: unknown): BridgeProxyBridgeRequestOption | null =>
  isBridgeRequestOption(value) ? value : null;

function accountFromJunction(junction: Junction): string {
  if (junction.isAccountId32) {
    return junction.asAccountId32.id.toString();
  } else if (junction.isAccountKey20) {
    const { key } = junction.asAccountKey20;
    return u8aToHex(key);
  } else {
    return '';
  }
}

function getAccount(data: BridgeTypesGenericAccount): string {
  if (data.isUnknown) {
    return '';
  }
  if (data.isEvm) {
    return data.asEvm?.toString?.() ?? '';
  }
  if (data.isSora) {
    return data.asSora?.toString?.() ?? '';
  }
  if (data.isParachain) {
    const versioned = data.asParachain;
    if (!versioned) return '';
    const { interior } = versioned.isV3 ? versioned.asV3 : versioned.asV2;

    if (interior.isX1) {
      return accountFromJunction(interior.asX1);
    } else if (interior.isX2) {
      return accountFromJunction(interior.asX2[1]);
    } else {
      return '';
    }
  }
  if (data.isLiberland) {
    return data.asLiberland?.toString?.() ?? '';
  }

  return '';
}

export function getEvmNetworkType(network: BridgeTypesGenericNetworkId | GenericNetworkId) {
  const net = network as BridgeTypesGenericNetworkId;

  if (net.isEvm) return BridgeNetworkType.Evm;
  return BridgeNetworkType.Eth;
}

function getNetworkType(network: BridgeTypesGenericNetworkId | GenericNetworkId): BridgeNetworkType {
  const net = network as BridgeTypesGenericNetworkId;

  if (net.isSub) return BridgeNetworkType.Sub;
  return getEvmNetworkType(net);
}

export function getEvmNetworkId(network: BridgeTypesGenericNetworkId | GenericNetworkId): number {
  const net = network as BridgeTypesGenericNetworkId;

  if (net.isEvmLegacy && net.asEvmLegacy) return net.asEvmLegacy.toNumber();

  const evmHex = net.asEvm?.toString?.();
  return parseInt(evmHex ?? '0', 16);
}

function getNetworkId(network: BridgeTypesGenericNetworkId | GenericNetworkId): BridgeNetworkId {
  const net = network as BridgeTypesGenericNetworkId;

  if (net.isSub && net.asSub) return net.asSub.toString() as SubNetwork;

  return getEvmNetworkId(net);
}

function getSubNetworkId(
  data: BridgeTypesGenericAccount,
  networkParam: BridgeTypesGenericNetworkId,
  usedNetwork: SubNetwork,
  parachainIds?: ParachainIds
): BridgeNetworkId | null {
  if (!data.isParachain) return usedNetwork;

  const versioned = data.asParachain;
  if (!versioned) return usedNetwork;
  const { interior } = versioned.isV3 ? versioned.asV3 : versioned.asV2;

  // this is relaychain as in networkParam
  if (interior.isX1) {
    return getNetworkId(networkParam);
  }
  // this is parachain
  if (interior.isX2) {
    const [networkJunction] = (interior.asX2 ?? []) as Junction[];

    if (networkJunction?.isParachain) {
      const paraId = (networkJunction.asParachain as CodecNumberLike | undefined)?.toNumber?.();

      if (paraId && parachainIds?.[usedNetwork as keyof ParachainIds] === paraId) {
        return usedNetwork;
      }
    }
  }

  return null;
}

function getBlock(data: BridgeTypesGenericTimepoint): number {
  if (data.isEvm && data.asEvm) {
    return data.asEvm.toNumber();
  }
  if (data.isSora && data.asSora) {
    return data.asSora.toNumber();
  }
  if (data.isParachain && data.asParachain) {
    return data.asParachain.toNumber();
  }

  return 0;
}

function formatBridgeTx(
  hash: string,
  data: BridgeProxyBridgeRequestOption,
  networkParam: BridgeTypesGenericNetworkId,
  usedNetworkId: BridgeNetworkId,
  parachainIds?: ParachainIds
): BridgeTransactionData | null {
  if (data.isEmpty || data.isSome === false) {
    return null;
  }

  const unwrapped = data.unwrap();
  const externalNetworkSrc = unwrapped.direction.isInbound ? unwrapped.source : unwrapped.dest;
  const externalNetworkId = networkParam.isSub
    ? getSubNetworkId(externalNetworkSrc, networkParam, usedNetworkId as SubNetwork, parachainIds)
    : getNetworkId(networkParam);

  if (externalNetworkId !== usedNetworkId) return null;

  const formatted: BridgeTransactionData = {
    externalNetwork: externalNetworkId,
    externalNetworkType: getNetworkType(networkParam),
    soraHash: hash,
    amount: unwrapped.amount.toString(),
    soraAssetAddress: toAssetId(unwrapped.assetId as any),
    status: BridgeTxStatus.Pending,
    startBlock: getBlock(unwrapped.startTimepoint),
    endBlock: getBlock(unwrapped.endTimepoint),
    direction: BridgeTxDirection.Incoming,
    soraAccount: '',
    externalAccount: '',
  };

  if (unwrapped.status?.isFailed || unwrapped.status?.isRefunded) {
    formatted.status = BridgeTxStatus.Failed;
  } else if (unwrapped.status?.isDone || unwrapped.status?.isCommitted) {
    formatted.status = BridgeTxStatus.Done;
  }

  if (unwrapped.direction.isInbound) {
    // incoming: network -> SORA
    formatted.externalAccount = getAccount(unwrapped.source);
    formatted.soraAccount = getAccount(unwrapped.dest);
    formatted.direction = BridgeTxDirection.Incoming;
  } else {
    // outgoing: SORA -> network
    formatted.soraAccount = getAccount(unwrapped.source);
    formatted.externalAccount = getAccount(unwrapped.dest);
    formatted.direction = BridgeTxDirection.Outgoing;
  }

  return formatted;
}

/**
 * Get all user transactions from external network
 */
export async function getUserTransactions(
  api: ApiPromise,
  accountAddress: string,
  networkParam: BridgeTypesGenericNetworkId,
  usedNetworkId: BridgeNetworkId,
  parachainIds?: ParachainIds
): Promise<BridgeTransactionData[]> {
  try {
    const buffer: BridgeTransactionData[] = [];
    const data = await api.query.bridgeProxy.transactions.entries([networkParam, accountAddress]);

    for (const [key, value] of data) {
      const hash = key.args[1];
      const optionValue = toBridgeRequestOption(value);
      if (!optionValue) continue;

      const tx = formatBridgeTx(hash.toString(), optionValue, networkParam, usedNetworkId, parachainIds);

      if (tx) {
        buffer.push(tx);
      }
    }

    return buffer;
  } catch {
    return [];
  }
}

/** Get transaction details */
export async function getTransactionDetails(
  api: ApiPromise,
  accountAddress: string,
  hash: string,
  networkParam: BridgeTypesGenericNetworkId,
  usedNetworkId: BridgeNetworkId,
  parachainIds?: ParachainIds
): Promise<BridgeTransactionData | null> {
  try {
    const result = await api.query.bridgeProxy.transactions([networkParam, accountAddress], hash);

    const data = toBridgeRequestOption(result);

    if (!data) return null;

    return formatBridgeTx(hash, data, networkParam, usedNetworkId, parachainIds);
  } catch {
    return null;
  }
}

/** Subscribe on transaction details */
export function subscribeOnTransactionDetails(
  apiRx: ApiRx,
  accountAddress: string,
  hash: string,
  networkParam: BridgeTypesGenericNetworkId,
  usedNetworkId: BridgeNetworkId,
  parachainIds?: ParachainIds
): Observable<BridgeTransactionData | null> | null {
  try {
    return apiRx.query.bridgeProxy.transactions([networkParam, accountAddress], hash).pipe(
      map((value) => {
        const optionValue = toBridgeRequestOption(value);

        if (!optionValue) return null;

        return formatBridgeTx(hash, optionValue, networkParam, usedNetworkId, parachainIds);
      })
    );
  } catch {
    return null;
  }
}

/** Get the amount of the asset locked on the bridge on the SORA side */
export async function getLockedAssets(
  api: ApiPromise,
  networkParam: BridgeTypesGenericNetworkId,
  assetAddress: string
): Promise<CodecString | null> {
  try {
    const data = await api.query.bridgeProxy.lockedAssets(networkParam, assetAddress);

    return data.toString();
  } catch {
    return null;
  }
}
