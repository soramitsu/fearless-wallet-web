import { AccountJson, AuthorizeRequest, MetadataRequest, SigningRequest } from '@extension-base/background/types';
import type { HexString } from '@polkadot/util/types';
import {
  approveSignPassword,
  approveSignSignature,
  cancelSignRequest,
  getAuthList,
  subscribeAccounts,
  subscribeAuthorizeRequests,
  subscribeMetadataRequests,
  subscribeSigningRequests,
} from '@/extension/messaging';
import { TCallback } from '@/interfaces';

export class ExtensionController {
  static async subscribeToAuths(setAuths: TCallback<AuthorizeRequest[]>) {
    await subscribeAuthorizeRequests(setAuths);
  }

  static async subscribeToAccounts(setAccounts: TCallback<AccountJson[]>) {
    await subscribeAccounts(setAccounts);
  }

  static async subscribeToMetadata(setMetadata: TCallback<MetadataRequest[]>) {
    await subscribeMetadataRequests(setMetadata);
  }

  static async subscribeToSigning(setRequests: TCallback<SigningRequest[]>) {
    await subscribeSigningRequests(setRequests);
  }

  static async getAuthList() {
    const { list } = await getAuthList();

    return list;
  }

  static async approveSignPassword(id: string, savePass: boolean, password?: string) {
    approveSignPassword(id, savePass, password);
  }

  static async approveSignSignature(id: string, signature: HexString) {
    approveSignSignature(id, signature);
  }

  static async cancelSign(id: string) {
    cancelSignRequest(id);
  }
}
