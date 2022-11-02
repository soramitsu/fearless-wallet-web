import type { HexString } from '@polkadot/util/types';
import { approveSignPassword, approveSignSignature, cancelSignRequest } from '@/extension/messaging';
export default class SignController {
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
