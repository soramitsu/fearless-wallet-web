import {
  approveAuthRequest,
  subscribeAccounts,
  subscribeAuthorizeRequests,
  subscribeMetadataRequests,
  subscribeSigningRequests,
} from '@/extension/messaging';
export default class AuthController {
  private requests: string[] = [];

  get getRequests() {
    return this.requests;
  }

  log(res: any) {
    console.log(res);
  }

  subscribe() {
    Promise.all([
      subscribeAccounts(this.log),
      subscribeAuthorizeRequests(this.log),
      subscribeMetadataRequests(this.log),
      subscribeSigningRequests(this.log),
    ]).catch(console.error);
  }
}
export const authController = new AuthController();
