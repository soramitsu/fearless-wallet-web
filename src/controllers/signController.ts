import { approveSignPassword, approveSignSignature, cancelSignRequest } from '../extension/messaging';
export default class SignController {
  static async approveSignPassword(id: string, savePass: boolean, password?: string) {
    if (password) approveSignPassword(id, savePass, password);
    else approveSignPassword(id, savePass);
  }

  static async approveSignSignature(id: string, signature: `0x${string}`) {
    approveSignSignature(id, signature);
  }

  static async cancelSign(id: string) {
    cancelSignRequest(id);
  }
}
