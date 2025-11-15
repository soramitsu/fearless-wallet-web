import type { CodecString } from '@sora/math';

export type TelemetryMetadata = Record<string, unknown>;

export interface TelemetryEvent {
  name: string;
  meta: TelemetryMetadata;
  timestamp: number;
}

export type TelemetryTransport = (events: TelemetryEvent[]) => Promise<void> | void;

const DEFAULT_MAX_QUEUE = 50;

export class PerpsExoticTelemetry {
  private queue: TelemetryEvent[] = [];

  constructor(
    private readonly transport: TelemetryTransport = async () => undefined,
    private readonly maxQueue = DEFAULT_MAX_QUEUE
  ) {
    if (!Number.isFinite(maxQueue) || maxQueue <= 0) {
      throw new Error('maxQueue should be a positive number');
    }
  }

  get size(): number {
    return this.queue.length;
  }

  public getEvents(): TelemetryEvent[] {
    return [...this.queue];
  }

  public record(name: string, meta: TelemetryMetadata = {}): TelemetryEvent {
    const trimmedName = name.trim();

    if (!trimmedName) {
      throw new Error('Telemetry event name must be a non-empty string');
    }

    const entry: TelemetryEvent = {
      name: trimmedName,
      meta,
      timestamp: Date.now(),
    };

    this.queue.push(entry);

    if (this.queue.length > this.maxQueue) {
      this.queue.splice(0, this.queue.length - this.maxQueue);
    }

    return entry;
  }

  public drain(): TelemetryEvent[] {
    const snapshot = this.getEvents();
    this.queue = [];

    return snapshot;
  }

  public async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const snapshot = this.getEvents();
    this.queue = [];

    await this.transport(snapshot);
  }
}

export const telemetry = new PerpsExoticTelemetry();

export const TELEMETRY_ZERO_AMOUNT: CodecString = '0';
