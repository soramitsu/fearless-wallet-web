import {
  assignSlots,
  buildAllocation,
  CHART_SLOT_COUNT,
  largestRemainder,
  RAY_COUNT,
  type AllocationEntity,
} from '@/portfolio/dashboard/allocation';

const entity = (key: string, value: number, name = key.toUpperCase()): AllocationEntity => ({ key, name, value });

describe('largestRemainder', () => {
  it('always adds up to the ray count, where plain rounding does not', () => {
    // Three equal parts round to 33 + 33 + 33 = 99.
    expect(largestRemainder([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(RAY_COUNT);
    expect(largestRemainder([1, 1, 1])).toEqual([34, 33, 33]);

    let seed = 7;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let round = 0; round < 200; round += 1) {
      const values = Array.from({ length: 1 + Math.floor(random() * 9) }, () => random() * 1000 + 0.01);
      const rays = largestRemainder(values);
      expect(rays.reduce((a, b) => a + b, 0)).toBe(RAY_COUNT);
      expect(rays.every((ray) => Number.isInteger(ray) && ray >= 0)).toBe(true);
    }
  });

  it('keeps a larger value at least as many rays as a smaller one', () => {
    const rays = largestRemainder([60, 25, 10, 5]);
    expect(rays).toEqual([60, 25, 10, 5]);
    expect([...rays].sort((a, b) => b - a)).toEqual(rays);
  });

  it('gives nothing to an empty or zero input', () => {
    expect(largestRemainder([])).toEqual([]);
    expect(largestRemainder([0, 0])).toEqual([0, 0]);
  });
});

describe('assignSlots', () => {
  it('gives the top five the lowest slots in rank order on a first run', () => {
    expect(assignSlots({}, ['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 });
  });

  it('keeps an entity on its slot while it stays in the top five, whatever its rank', () => {
    const first = assignSlots({}, ['a', 'b', 'c']);
    expect(assignSlots(first, ['c', 'b', 'a'])).toEqual(first);
  });

  it('hands a freed slot to the newcomer and forgets what dropped out', () => {
    const previous = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    // f overtakes everything and pushes e out of the top five.
    expect(assignSlots(previous, ['f', 'a', 'b', 'c', 'd', 'e'])).toEqual({ f: 5, a: 1, b: 2, c: 3, d: 4 });
  });

  it('ignores stored slots that are out of range or used twice', () => {
    expect(assignSlots({ a: 0, b: 9, c: 2, d: 2 }, ['a', 'b', 'c', 'd'])).toEqual({ c: 2, a: 1, b: 3, d: 4 });
    expect(assignSlots({ a: 1.5 }, ['a'])).toEqual({ a: 1 });
  });
});

describe('buildAllocation', () => {
  it('lists the largest first, with shares and rays that add up', () => {
    const { groups } = buildAllocation([entity('b', 30), entity('a', 60), entity('c', 10)]);

    expect(groups.map(({ key }) => key)).toEqual(['a', 'b', 'c']);
    expect(groups.map(({ rays }) => rays)).toEqual([60, 30, 10]);
    expect(groups.reduce((acc, { share }) => acc + share, 0)).toBeCloseTo(100, 10);
    expect(groups.map(({ slot }) => slot)).toEqual([1, 2, 3]);
  });

  it('folds everything past the fifth into Other and names what it holds', () => {
    const { groups, slots } = buildAllocation(
      Array.from({ length: 8 }, (_, index) => entity(`e${index}`, 100 - index * 10, `Token ${index}`))
    );

    expect(groups).toHaveLength(CHART_SLOT_COUNT + 1);
    const other = groups[groups.length - 1];
    expect(other).toMatchObject({ key: 'other', name: 'Other', slot: 0, members: ['Token 5', 'Token 6', 'Token 7'] });
    expect(Object.keys(slots)).toHaveLength(CHART_SLOT_COUNT);
    expect(groups.reduce((acc, { rays }) => acc + rays, 0)).toBe(RAY_COUNT);
  });

  it('does not hide a single entity behind the name Other', () => {
    const { groups } = buildAllocation(Array.from({ length: 6 }, (_, index) => entity(`e${index}`, 60 - index * 5, `Token ${index}`)));
    const last = groups[groups.length - 1];

    expect(last).toMatchObject({ key: 'e5', name: 'Token 5', slot: 0 });
    expect(last.members).toBeUndefined();
  });

  it('leaves out zero, negative and non-finite values, and has nothing to draw without value', () => {
    expect(buildAllocation([entity('a', 0), entity('b', -5), entity('c', Number.NaN)])).toEqual({ groups: [], slots: {} });
    expect(buildAllocation([entity('a', 10), entity('b', 0)]).groups.map(({ key }) => key)).toEqual(['a']);
  });

  it('keeps colours when the order changes', () => {
    const first = buildAllocation([entity('a', 50), entity('b', 30), entity('c', 20)]);
    const second = buildAllocation([entity('c', 70), entity('a', 20), entity('b', 10)], first.slots);

    const slotOf = (result: typeof first, key: string) => result.groups.find((group) => group.key === key)?.slot;
    ['a', 'b', 'c'].forEach((key) => expect(slotOf(second, key)).toBe(slotOf(first, key)));
  });

  it('breaks ties by name so the order is stable', () => {
    const { groups } = buildAllocation([entity('z', 10, 'Zed'), entity('a', 10, 'Alpha')]);
    expect(groups.map(({ name }) => name)).toEqual(['Alpha', 'Zed']);
  });
});
