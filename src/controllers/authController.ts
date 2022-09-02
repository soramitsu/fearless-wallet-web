import {
  AccountJson,
  AuthorizeRequest,
  MetadataRequest,
  SigningRequest,
} from '@polkadot/extension-base/background/types';
import {
  getAuthList,
  subscribeAccounts,
  subscribeAuthorizeRequests,
  subscribeMetadataRequests,
  subscribeSigningRequests,
} from '@/extension/messaging';
export default class AuthController {
  static async subscribeToAuths(setAuths: (accounts: AuthorizeRequest[]) => void) {
    await subscribeAuthorizeRequests(setAuths);
  }

  static async subscribeToAccounts(setAccounts: (accounts: AccountJson[]) => void) {
    await subscribeAccounts(setAccounts);
  }

  static async subscribeToMetadata(setMetadata: (accounts: MetadataRequest[]) => void) {
    await subscribeMetadataRequests(setMetadata);
  }

  static async subscribeToSigning(setRequests: (accounts: SigningRequest[]) => void) {
    await subscribeSigningRequests(setRequests);
  }

  static async getAuthList() {
    const { list } = await getAuthList();

    return list;
  }
}
export const authController = AuthController;
