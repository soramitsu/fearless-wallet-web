import { describe, expect, it } from 'vitest';
import {
  DIAL,
  FLIGHT,
  LADDER_MS,
  LOADER,
  MAX_TIER,
  MIRROR,
  PERSPECTIVE,
  SEAL,
  SHIKIBAN,
  bezier,
  cameraAt,
  depthScale,
  dialSegment,
  dialState,
  gateAlpha,
  gateScale,
  irisRadius,
  irisScale,
  landingFrom,
  loaderComets,
  rimPathData,
  rimPoint,
  sealStageNumber,
  tierScale,
} from '@/feel/shikiban';
import { sealStrokeAmount } from '@/feel/shikibanDraw';
import { SOLAR } from '@/feel/solarGeometry';

// Brand kit v4, SPEC "Shikiban": the formulas here must be the kit's, so they are held to the keyframes the kit
// sampled from its own (tokens/shikiban.json `flight.samples`, at u = 0, 1/24 ... 1).
const samples = FLIGHT.samples;
const steps = samples.camera.length - 1;
const at = (index: number) => index / steps;

describe('round heaven, square earth', () => {
  it('steps every duration by the square root of two', () => {
    expect(LADDER_MS).toEqual([90, 128, 180, 255, 360, 510, 720, 1020]);
    for (let i = 1; i < LADDER_MS.length; i++) expect(LADDER_MS[i] / LADDER_MS[i - 1]).toBeCloseTo(Math.SQRT2, 1);
  });

  it('nests the gates so that from the start they are the flat figure: each 1/sqrt(2) of the last', () => {
    SHIKIBAN.gates.forEach((_, index) => expect(gateScale(index, 0)).toBeCloseTo(Math.SQRT2 ** -index, 4));
    expect(SHIKIBAN.gates.at(-1)?.figure).toBe('mirror');
  });

  it('draws the mirror as eight quarter circles that meet at its cusps', () => {
    expect(MIRROR.rim).toHaveLength(8);
    expect(MIRROR.cusp).toBeCloseTo(Math.cos(Math.PI / 8), 5);
    // 12 o'clock is the top of the top lobe; a sixteenth of a turn on is a cusp.
    expect(rimPoint(0)[0]).toBeCloseTo(0, 6);
    expect(rimPoint(0)[1]).toBeCloseTo(-1, 6);
    expect(Math.hypot(...rimPoint(1 / 16))).toBeCloseTo(MIRROR.cusp, 5);
    expect(Math.hypot(...rimPoint(0.25))).toBeCloseTo(1, 6);
    expect(rimPathData().match(/A/g)).toHaveLength(8);
  });
});

describe('depth is one law', () => {
  it('scales a plane at depth z by p / (p + z)', () => {
    expect(depthScale(0)).toBe(1);
    expect(depthScale(PERSPECTIVE)).toBe(0.5);
  });

  it('flies the camera, the gates, the opening and the tiers exactly as the kit sampled them', () => {
    for (let index = 0; index <= steps; index++) {
      const u = at(index);
      expect(cameraAt(u)).toBeCloseTo(samples.camera[index], 3);
      expect(irisScale(u)).toBeCloseTo(samples.iris[index], 3);
      samples.gates.forEach((gate, i) => expect(gateScale(i, u)).toBeCloseTo(gate[index], 4));
      samples.gateAlpha.forEach((gate, i) => expect(gateAlpha(i, u)).toBeCloseTo(gate[index], 4));
      samples.tiers.forEach((tier, k) => expect(tierScale(k, u)).toBeCloseTo(tier[index], 4));
    }
  });

  it('lands every tier at exactly its place, the nearer ones always ahead', () => {
    for (let k = 0; k <= MAX_TIER; k++) {
      expect(tierScale(k, 1)).toBe(1);
      expect(samples.tiers[k].at(-1)).toBe(1);
      if (k) expect(tierScale(k, 0.6)).toBeLessThan(tierScale(k - 1, 0.6));
    }
  });

  it('never draws a tier larger than its place, so a side panel gains no scroll width', () => {
    for (const tier of samples.tiers) for (const scale of tier) expect(scale).toBeLessThanOrEqual(1);
    for (let k = 0; k <= MAX_TIER; k++) expect(landingFrom(k)).toBeLessThan(1);
  });

  it('starts the short arrival where the kit says', () => {
    FLIGHT.landingFrom.forEach((scale, k) => expect(landingFrom(k)).toBeCloseTo(scale, 4));
  });

  it('opens the mirror from a point at 550 ms and lets it clear a popup before the flight ends', () => {
    expect(irisRadius(FLIGHT.irisAtMs, 561)).toBe(0);
    expect(irisRadius(FLIGHT.irisAtMs + 1, 561)).toBeGreaterThan(0);
    const farthest = Math.hypot(561 / 2, 600 * 0.5375);
    expect(irisRadius(FLIGHT.durationMs * 0.9, 561)).toBeGreaterThan(farthest);
    let previous = 0;
    for (let ms = FLIGHT.irisAtMs; ms <= FLIGHT.durationMs; ms += 20) {
      const radius = irisRadius(ms, 561);
      expect(radius).toBeGreaterThanOrEqual(previous);
      previous = radius;
    }
  });

  it('passes each gate in turn, the mirror last', () => {
    const gone = SHIKIBAN.gates.map((_, i) => Array.from({ length: 200 }, (_unused, step) => step / 200).find((u) => gateScale(i, u) === 0) ?? 1);
    for (let i = 1; i < gone.length; i++) expect(gone[i]).toBeGreaterThan(gone[i - 1]);
  });
});

describe('easing', () => {
  it('is the curve the browser draws for the same control points', () => {
    const settle = bezier(SHIKIBAN.easing.settle);
    expect(settle(0)).toBe(0);
    expect(settle(1)).toBe(1);
    // An expand curve: most of the way there early.
    expect(settle(0.3)).toBeGreaterThan(0.8);
    const linear = bezier([0.25, 0.25, 0.75, 0.75]);
    expect(linear(0.4)).toBeCloseTo(0.4, 4);
  });
});

describe('the sync dial', () => {
  it('knows nothing until the wallet knows how many networks it reads', () => {
    expect(dialState()).toMatchObject({ state: 'idle', lit: [0, 0], fraction: 0 });
    expect(dialState({ done: 3, total: 0 }).state).toBe('idle');
  });

  it('lights the share that has answered, and never more than there is', () => {
    expect(dialState({ done: 9, total: 14 })).toMatchObject({ state: 'syncing', lit: [0, 0.64286] });
    expect(dialState({ done: 20, total: 14 })).toMatchObject({ state: 'live', lit: [0, 1] });
    expect(dialState({ done: -2, total: 14 }).lit).toEqual([0, 0]);
  });

  it('is live when every network has answered, and partial when some gave up: their share is the end of the ring', () => {
    expect(dialState({ done: 14, total: 14 }).state).toBe('live');
    const partial = dialState({ done: 12, failed: 2, total: 14 });
    expect(partial.state).toBe('partial');
    expect(partial.failed[0]).toBeCloseTo(12 / 14, 4);
    expect(partial.failed[1]).toBe(1);
  });

  it('keeps syncing while anything is outstanding, even with failures', () => {
    expect(dialState({ done: 5, failed: 2, total: 14 }).state).toBe('syncing');
  });

  it('cuts an arc into eight segments with a gap between them', () => {
    expect(dialSegment(0, [0, 1])).toEqual([DIAL.gapTurn / 2, 1 / 8 - DIAL.gapTurn / 2].map((value) => Number(value.toFixed(5))));
    expect(dialSegment(3, [0, 0.25])).toBeNull();
    const part = dialSegment(1, [0, 0.2]);
    expect(part?.[1]).toBeCloseTo(0.2, 5);
  });
});

describe('the loader', () => {
  it('runs three comets a third of a turn apart, each with a tail an eighth of a turn long', () => {
    const comets = loaderComets(0);
    expect(comets).toHaveLength(LOADER.comets);
    expect(comets.map(([head]) => head)).toEqual([0, 0.33333, 0.66667]);
    for (const [head, tail] of comets) expect(head - tail).toBeCloseTo(LOADER.tailTurn, 5);
    expect(loaderComets(LOADER.secondsPerTurn / 2)[0][0]).toBeCloseTo(0.5, 5);
  });
});

describe('the seal', () => {
  const rings = SOLAR.strokes.filter((item) => item.group === 'ring');
  const hexagram = SOLAR.strokes.filter((item) => item.group === 'hexagram');
  const lattice = SOLAR.strokes.filter((item) => item.group === 'lattice');

  it('numbers the stages in the order they happen', () => {
    expect(['idle', 'ready', 'signed', 'sent', 'accepted'].map((stage) => sealStageNumber(stage as never))).toEqual([0, 1, 2, 3, 4]);
    expect(SEAL.stages).toEqual(['ready', 'signed', 'sent', 'accepted']);
  });

  it('closes both rings when the transfer is ready, and nothing else', () => {
    for (const ring of rings) expect(sealStrokeAmount(ring, 1, SEAL.progress.accepted)).toBe(1);
    for (const side of hexagram) expect(sealStrokeAmount(side, 1, SEAL.progress.accepted)).toBe(0);
    for (const line of lattice) expect(sealStrokeAmount(line, 1, SEAL.progress.accepted)).toBe(0);
  });

  it('draws one side of the upward triangle per stage: signed, sent, accepted', () => {
    expect(hexagram.slice(0, 3).map((side) => sealStrokeAmount(side, 2, 0.41))).toEqual([1, 0, 0]);
    expect(hexagram.slice(0, 3).map((side) => sealStrokeAmount(side, 2.5, 0.41))).toEqual([1, 0.5, 0]);
    expect(hexagram.slice(0, 3).map((side) => sealStrokeAmount(side, 4, 0.41))).toEqual([1, 1, 1]);
    // The three sides are a closed triangle: each starts where the last ended.
    const [a, b, c] = hexagram.slice(0, 3) as Array<{ x1: number; y1: number; x2: number; y2: number }>;
    expect([a.x2, a.y2]).toEqual([b.x1, b.y1]);
    expect([b.x2, b.y2]).toEqual([c.x1, c.y1]);
    expect([c.x2, c.y2]).toEqual([a.x1, a.y1]);
  });

  it('leaves the rest of the figure to the ignite, which only acceptance starts', () => {
    const downward = hexagram[3];
    expect(sealStrokeAmount(downward, 3.9, 1)).toBe(0);
    expect(sealStrokeAmount(downward, 4, 1)).toBe(1);
    // The ignite takes up at the progress where the kit's own ignite has just closed the upward triangle.
    expect(SEAL.progress.accepted).toBeCloseTo((hexagram[2] as { reveal: [number, number] }).reveal[1], 5);
  });
});
