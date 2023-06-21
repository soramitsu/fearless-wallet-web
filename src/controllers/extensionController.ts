import type { HexString } from '@polkadot/util/types';
import { approveSignPassword, approveSignSignature, cancelSignRequest, getAuthList } from '@/extension/messaging';

export class ExtensionController {
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
