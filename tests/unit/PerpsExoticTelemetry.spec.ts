import { PerpsExoticTelemetry, telemetry, TELEMETRY_ZERO_AMOUNT } from '@/utils/perpsExoticTelemetry';

describe('PerpsExoticTelemetry', () => {
  it('records events with metadata and trims queue size', () => {
    const customTelemetry = new PerpsExoticTelemetry(async () => undefined, 2);

    const event = customTelemetry.record(' execution ', { leg: 1 });

    expect(event.name).toBe('execution');
    expect(event.meta).toEqual({ leg: 1 });
    expect(typeof event.timestamp).toBe('number');
    expect(customTelemetry.size).toBe(1);

    customTelemetry.record('alpha');
    customTelemetry.record('beta');

    expect(customTelemetry.size).toBe(2);
    expect(customTelemetry.getEvents().map(({ name }) => name)).toEqual(['alpha', 'beta']);
  });

  it('flushes queued events through provided transport', async () => {
    const transport = jest.fn();
    const customTelemetry = new PerpsExoticTelemetry(transport);

    customTelemetry.record('order_created');
    customTelemetry.record('order_filled', { price: 42 });

    await customTelemetry.flush();

    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'order_created' }),
        expect.objectContaining({ name: 'order_filled', meta: { price: 42 } }),
      ])
    );
    expect(customTelemetry.size).toBe(0);
  });

  it('shared telemetry singleton is accessible and exposes constants', () => {
    telemetry.record('heartbeat');

    expect(telemetry.size).toBeGreaterThanOrEqual(1);
    expect(telemetry.getEvents().pop()?.name).toBe('heartbeat');
    expect(TELEMETRY_ZERO_AMOUNT).toBe('0');
  });
});
