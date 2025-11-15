import type { SubmittableExtrinsic } from '@polkadot/api/promise/types';
import type { WeightV2 } from '@polkadot/types/interfaces';
import { assert } from '@polkadot/util';
import { FPNumber, NumberLike, CodecString } from '@sora/math';

import { Messages } from '../logger';
import { Operation } from '../types';
import type { Api } from '../api';

/**
 * This module is used for internal needs
 */
export class MstTransfersModule<T> {
  constructor(private readonly root: Api<T>) {}

  private createAccountId(address: string, role: 'initiator' | 'co-signer'): string {
    try {
      return this.root.api.createType('AccountId32', address).toString();
    } catch (error) {
      const label = role === 'initiator' ? 'initiating account' : 'multisig signer';
      throw new Error(`Invalid ${label} address provided for multisig approval: ${address}`);
    }
  }

  private resolveMultisigWeight(): WeightV2 {
    const systemBlockWeights = this.root.api.consts?.system?.blockWeights as unknown as {
      perClass?: {
        normal?: {
          maxExtrinsic?: unknown;
        };
      };
    };

    const rawWeight = systemBlockWeights?.perClass?.normal?.maxExtrinsic;

    if (!rawWeight) {
      throw new Error(
        'Unable to determine multisig weight from runtime metadata. Please refresh the network metadata and try again.'
      );
    }

    let weight: WeightV2;

    try {
      weight = this.root.api.registry.createType('WeightV2', rawWeight) as WeightV2;
    } catch (error) {
      throw new Error(`Failed to normalise multisig weight returned by the runtime: ${(error as Error).message}`);
    }

    const refTime = BigInt(weight.refTime?.toString?.() ?? '0');
    const proofSize = BigInt(weight.proofSize?.toString?.() ?? '0');

    if (refTime === 0n && proofSize === 0n) {
      throw new Error(
        'Runtime returned a zero multisig weight. Please refresh metadata or try again after the network updates.'
      );
    }

    return weight;
  }

  /**
   * Returns batch tx
   * @param data List with data for Transfer All Tx
   */
  public prepareCall(
    data: Array<{ assetAddress: string; toAddress: string; amount: NumberLike }>
  ): SubmittableExtrinsic {
    assert(data.length, Messages.noTransferData);

    const txs = data.map((item) => {
      return this.root.api.tx.assets.transfer(
        item.assetAddress,
        item.toAddress,
        new FPNumber(item.amount).toCodecString()
      );
    });
    return this.root.api.tx.utility.batchAll(txs);
  }

  /**
   * Returns the final extrinsic for Trnaser All MST transaction
   * @param call `api.prepareTransferAllAsMstCall` result
   * @param threshold Minimum number of signers
   * @param coSigners List of co-signers
   */
  public prepareExtrinsic(
    call: SubmittableExtrinsic,
    threshold: number,
    coSigners: Array<string>
  ): SubmittableExtrinsic {
    assert(this.root.account, Messages.connectWallet);
    assert(threshold > 0, 'MST threshold must be greater than zero');
    assert(coSigners.length > 0, 'At least one co-signer is required');
    assert(
      threshold <= coSigners.length + 1,
      'MST threshold cannot be greater than the number of participants (co-signers + you)'
    );

    const account = this.root.account;
    const accountAddress = account.pair?.address ?? (account as { address?: string }).address;

    assert(accountAddress, Messages.connectWallet);

    const callerKey = this.createAccountId(accountAddress, 'initiator');
    const normalizedSigners = coSigners.map((signer) => {
      const accountId = this.createAccountId(signer, 'co-signer');

      assert(accountId !== callerKey, 'Co-signers list must not contain the initiating account');

      return accountId;
    });

    const deduplicated = new Set(normalizedSigners);

    assert(deduplicated.size === normalizedSigners.length, 'Duplicate co-signers are not allowed');

    const sortedSigners = [...normalizedSigners].sort();

    assert(
      sortedSigners.every((value, index) => value === normalizedSigners[index]),
      'Co-signers must be provided in lexicographical order'
    );

    const maxWeight = this.resolveMultisigWeight();

    return this.root.api.tx.multisig.approveAsMulti(threshold, sortedSigners, null, call.method.hash, maxWeight);
  }

  /**
   * Get network fee for Transfer All MST Tx
   * @param extrinsic `api.prepareTransferAllAsMstExtrinsic` result
   */
  public async getNetworkFee(tx: SubmittableExtrinsic): Promise<CodecString> {
    return await this.root.getTransactionFee(tx);
  }

  /**
   * Transfer all data from array as MST
   * @param extrinsic `api.prepareTransferAllAsMstExtrinsic` result
   */
  public submit(extrinsic: SubmittableExtrinsic): Promise<T> {
    assert(this.root.account, Messages.connectWallet);
    return this.root.submitExtrinsic(extrinsic, this.root.account.pair, {
      type: Operation.TransferAll,
    });
  }

  /**
   * Get the last (frist from array of multisigns) pending TX from MST
   * @param mstAccount MST account
   */
  public async getLastPendingTx(mstAccount: string): Promise<string | null> {
    try {
      const pendingData = await this.root.api.query.multisig.multisigs.entries(mstAccount);
      return pendingData.map(([item, _]) => item.args[1].toString())[0];
    } catch {
      return null;
    }
  }
}
