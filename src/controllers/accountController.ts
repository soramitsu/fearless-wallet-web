import LocalStorageController from '@/controllers/localStorageController';
import { Hash } from '@/util/hash';

interface PasswordValue {
  value: string;
  options: Record<string, string>;
}

export default class AccountController {
  private readonly postfix = 'sora';
  private readonly radix = 2;
  private readonly lsAccount = new LocalStorageController('account');
  private readonly passwordLifeTime = 1000 * 60 * 60 * 24; // 24 hours
  private readonly passwordStorageName = 'password';
  private readonly hideZeroBalanceStorageName = 'hide-zero-balance';
  private readonly subsequenceTokens = 'subsequence-tokens';

  private getAccountPasswordValue(): PasswordValue {
    return this.lsAccount.get(this.passwordStorageName) as PasswordValue;
  }

  private getPasswordHash(password: string): string {
    const salt = Hash.sha256(password.length.toString(this.radix));

    return `${password}${salt}${this.postfix}`;
  }

  public savePassword(password: string): void {
    const hashPasswordString = this.getPasswordHash(password);
    const hashPassword = Hash.sha256(hashPasswordString);

    this.lsAccount.set(this.passwordStorageName, hashPassword, {}, { saveDateCreated: true });
  }

  public updatedPasswordDateCreated(date?: number): void {
    const { value, options } = this.getAccountPasswordValue();
    const opt = options ?? {};

    if (date !== undefined) opt.dateCreated = date.toString();

    if (value) this.lsAccount.set(this.passwordStorageName, value, opt, { saveDateCreated: date === undefined });
  }

  public isSamePassword(password: string): boolean {
    const { value } = this.getAccountPasswordValue();

    if (value === undefined) return false;

    const hashPasswordString = this.getPasswordHash(password);

    return Hash.isSameAs(hashPasswordString, value);
  }

  public isSavedPassword(): boolean {
    const { value } = this.getAccountPasswordValue();

    return value !== undefined;
  }

  public isCorrectPasswordAge(): boolean {
    const { options } = this.getAccountPasswordValue();

    if (!options) return false;

    const { dateCreated } = options;

    return Date.now() < +dateCreated + this.passwordLifeTime;
  }

  public getHideZeroBalanceValue(): boolean {
    const lsVisible = this.lsAccount.get(this.hideZeroBalanceStorageName);

    return lsVisible.value ?? false;
  }

  public setHideZeroBalanceValue(value: boolean): void {
    this.lsAccount.set(this.hideZeroBalanceStorageName, value);
  }

  public getSubsequenceTokens(): string[] {
    const subsequenceTokens = this.lsAccount.get(this.subsequenceTokens);

    return subsequenceTokens.value?.split(',') ?? [];
  }

  public setSubsequenceTokens(value: string[]): void {
    this.lsAccount.set(this.subsequenceTokens, value.join());
  }
}
