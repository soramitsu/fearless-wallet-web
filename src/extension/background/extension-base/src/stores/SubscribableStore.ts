import { Subject } from 'rxjs';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import { IS_EXTENSION } from '@/consts/global';

export default abstract class SubscribableStore<T> extends (IS_EXTENSION ? BaseExtensionStore : BaseWebStore)<T> {
  private readonly subject: Subject<T> = new Subject<T>();

  public getSubject(): Subject<T> {
    return this.subject;
  }

  public set(_key: string, value: T, update?: () => void): void {
    super.set(_key, value, () => {
      this.subject.next(value);

      update?.();
    });
  }

  public remove(_key: string, update?: () => void): void {
    super.remove(_key, update);
  }

  public all(update: (key: string, value: T) => void): Promise<void> {
    return super.all(update);
  }

  public get(_key: string, update: (value: T) => void): void {
    super.get(_key, update);
  }

  public getAndWait(_key: string): Promise<T | undefined> {
    return super.getAndWait(_key);
  }

  // Read, transform and write one record in the shared write queue, keeping fields the caller does not set.
  public updateAndWait(
    _key: string,
    transform: (current: T | undefined) => T | undefined,
    publish?: (committed: T) => void,
    trackFailure = true
  ): Promise<T | undefined> {
    return super.updateAndWait(_key, transform, publish, trackFailure);
  }
}
