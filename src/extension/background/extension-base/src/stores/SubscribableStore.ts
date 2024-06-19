import { Subject } from 'rxjs';
import BaseStore from '@extension-base/stores/Base';

export default abstract class SubscribableStore<T> extends BaseStore<T> {
  private readonly _subject: Subject<T> = new Subject<T>();

  get subject() {
    return this._subject;
  }

  public override set(_key: string, value: T, update?: () => void): void {
    super.set(_key, value, () => {
      this.subject.next(value);

      update?.();
    });
  }
}
