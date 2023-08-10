import EventEmitter from 'eventemitter3';
import { EventRegistry, EventItem, EventType } from './types';

export class EventService extends EventEmitter<EventRegistry> {
  private lazyTime: number;
  private timeoutId: NodeJS.Timeout | null;
  private pendingEvents: EventItem<EventType>[] = [];
  private lazyEmitter = new EventEmitter<{ lazy: [EventItem<EventType>[], EventType[]] }>();

  public readonly waitCryptoReady: Promise<boolean>;

  constructor(options: { lazyTime: number } = { lazyTime: 300 }) {
    super();
    this.lazyTime = options.lazyTime;
    this.timeoutId = null;
    this.waitCryptoReady = this.generateWaitPromise('crypto.ready');
  }

  private generateWaitPromise<T extends EventType>(eventType: T): Promise<boolean> {
    return new Promise((resolve) => {
      this.once(eventType, (isReady) => {
        resolve(isReady);
      });
    });
  }

  private setLazyTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.emitLazy();
    }, this.lazyTime);
  }

  private emitLazy(): void {
    try {
      this.lazyEmitter.emit(
        'lazy',
        this.pendingEvents,
        this.pendingEvents.map((e) => e.type)
      );
    } catch (e) {
      console.error('Get error in some listener of lazy event', e);
    }

    this.pendingEvents = [];
    this.timeoutId = null;
  }

  public onLazy(callback: (events: EventItem<EventType>[], eventTypes: EventType[]) => void): void {
    this.lazyEmitter.on('lazy', callback);
  }

  public offLazy(callback: (events: EventItem<EventType>[], eventTypes: EventType[]) => void): void {
    this.lazyEmitter.off('lazy', callback);
  }

  public onceLazy(callback: (events: EventItem<EventType>[], eventTypes: EventType[]) => void): void {
    this.lazyEmitter.once('lazy', callback);
  }

  public override emit<T extends EventType>(eventType: T, ...args: EventEmitter.EventArgs<EventRegistry, T>): boolean {
    this.pendingEvents.push({ type: eventType, data: args as EventRegistry[T] });
    this.setLazyTimeout();

    return super.emit(eventType, ...args);
  }
}
