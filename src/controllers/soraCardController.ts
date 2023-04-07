import { LocalStorage } from '@/controllers/localStorageController';

class SoraCardController {
  // private readonly lsSoraCard = new LocalStorage('sora-card');
  private readonly ls = new LocalStorage('');
  private readonly PWEmail = 'PW-Email';

  getPWEmail(): string {
    return this.ls.getWithoutParse(this.PWEmail)!;
  }

  removePWEmail(): void {
    this.ls.remove(this.PWEmail);
  }
}

export const soraCardController = new SoraCardController();
