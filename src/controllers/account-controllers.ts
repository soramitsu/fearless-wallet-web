import LocalStorage from '../util/localStorage';
import { Hash } from '../util/hash';

export default class AccountController {
  private postfix = 'sora';
  private radix = 2;
  private lsAccount = new LocalStorage('account');
  private passwordLifeTime = 1000 * 60 * 60 * 24; // 24 hours

  private getAccountPasswordValue() {
    const accountPasswordValue = this.lsAccount.get('password');

    if (!accountPasswordValue) return {};

    const { value, options } = JSON.parse(accountPasswordValue);

    return { value, options };
  }

  private hashPasswordString(password: string) {
    const salt = Hash.sha256(password.length.toString(this.radix));

    return `${password}${salt}${this.postfix}`;
  }

  savePassword(password: string) {
    const hashPasswordString = this.hashPasswordString(password);
    const hashPassword = Hash.sha256(hashPasswordString);

    this.lsAccount.set('password', hashPassword, {}, { saveDateCreated: true });

    return hashPassword;
  }

  updatedPasswordDateCreated() {
    const { value, options } = this.getAccountPasswordValue();
    const opt = options ?? {};

    if (value) this.lsAccount.set('password', value, opt, { saveDateCreated: true });
  }

  isSamePassword(password: string) {
    const { value } = this.getAccountPasswordValue();

    if (value === undefined) return false;

    const hashPasswordString = this.hashPasswordString(password);

    return Hash.isSameAs(hashPasswordString, value);
  }

  isSavedPassword() {
    const { value } = this.getAccountPasswordValue();

    return value !== undefined;
  }

  isCorrectPasswordAge() {
    const { options } = this.getAccountPasswordValue();

    if (!options) return false;

    const { dateCreated } = options;

    return Date.now() < +dateCreated + this.passwordLifeTime;
  }
}
