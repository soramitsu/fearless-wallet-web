export default class AuthController {
  private requests: string[] = ['test'];
  get getRequests() {
    return this.requests;
  }
}
