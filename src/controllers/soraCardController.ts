import { LocalStorage } from '@/controllers/localStorageController';

class SoraCardController {
  // private readonly lsSoraCard = new LocalStorage('sora-card');
  private readonly ls = new LocalStorage('');
  private readonly PWEmail = 'PW-Email';
  private readonly PWToken = 'PW-token';
  private readonly PWRefreshToken = 'PW-refresh-token';

  getPWEmail(): string {
    return this.ls.getWithoutParse(this.PWEmail)!;
  }

  getPWToken(): string {
    return this.ls.getWithoutParse(this.PWToken)!;
  }

  setPWToken(value: string): void {
    this.ls.setDefault(this.PWToken, value)!;
  }

  getPWRefreshToken(): string {
    return this.ls.getWithoutParse(this.PWRefreshToken)!;
  }

  // extension only function for integration with polkaswap
  setPWRefreshToken(value: string): void {
    this.ls.setDefault(this.PWRefreshToken, value)!;
    this.setPWToken('1');
  }

  removePWEmail(): void {
    this.ls.remove(this.PWEmail);
  }

  clearTokensFromLocalStorage = () => {
    this.ls.remove(this.PWToken);
    this.ls.remove(this.PWRefreshToken);
  };

  clearPayWingsKeysFromLocalStorage = () => {
    this.ls.remove('PW-ProcessID');
    this.ls.remove('PW-conf');
    this.ls.remove('PW-Country');
    this.ls.remove('PW-PhoneNumber');
    this.ls.remove('PW-PhoneNumberValid');
    this.ls.remove('PW-Email');
    this.ls.remove('PW-AuthUserID');
    this.ls.remove('PW-DocumentSubtype');
    this.ls.remove('PW-KycReferenceID');
    this.ls.remove('PW-KycStart');
    this.ls.remove('PW-otpID');
    this.ls.remove('PW-OTPLength');
    this.ls.remove('PW-FirstName');
    this.ls.remove('PW-MiddleName');
    this.ls.remove('PW-LastName');
    this.ls.remove('PW-Check');
    this.ls.remove('PW-WhitelabelReferenceID');
    this.ls.remove('PW-KycReferenceID');
    this.ls.remove('PW-documents');
    this.ls.remove('PW-document');
    this.ls.remove('PW-VideoID');
    this.ls.remove('PW-Authorization');
    this.ls.remove('PW-retry');
    this.ls.remove('PW-AppReferenceID');
  };
}

export const soraCardController = new SoraCardController();
