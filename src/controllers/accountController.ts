import LocalStorage from '../util/localStorage';
import { Hash } from '../util/hash';
import { bool } from '@polkadot/types-codec';

interface PasswordValue {
  value: string;
  options: Record<string, string>;
}

export default class AccountController {
  private postfix = 'sora';
  private radix = 2;
  private lsAccount = new LocalStorage('account');
  private passwordLifeTime = 1000 * 60 * 60 * 24; // 24 hours

  private getAccountPasswordValue(): PasswordValue {
    const accountPasswordValue = this.lsAccount.get('password');

    return accountPasswordValue ? JSON.parse(accountPasswordValue) : {};
  }

  private getPasswordHash(password: string): string {
    const salt = Hash.sha256(password.length.toString(this.radix));

    return `${password}${salt}${this.postfix}`;
  }

  savePassword(password: string): void {
    const hashPasswordString = this.getPasswordHash(password);
    const hashPassword = Hash.sha256(hashPasswordString);

    this.lsAccount.set('password', hashPassword, {}, { saveDateCreated: true });
  }

  updatedPasswordDateCreated(): void {
    const { value, options } = this.getAccountPasswordValue();
    const opt = options ?? {};

    if (value) this.lsAccount.set('password', value, opt, { saveDateCreated: true });
  }

  isSamePassword(password: string): boolean {
    const { value } = this.getAccountPasswordValue();

    if (value === undefined) return false;

    const hashPasswordString = this.getPasswordHash(password);

    return Hash.isSameAs(hashPasswordString, value);
  }

  isSavedPassword(): boolean {
    const { value } = this.getAccountPasswordValue();

    return value !== undefined;
  }

  isCorrectPasswordAge(): boolean {
    const { options } = this.getAccountPasswordValue();

    if (!options) return false;

    const { dateCreated } = options;

    return Date.now() < +dateCreated + this.passwordLifeTime;
  }
}
