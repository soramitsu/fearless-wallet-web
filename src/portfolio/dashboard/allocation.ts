/**
 * The allocation fan: 100 rays, one per percent of the counted portfolio, grouped by token, network or wallet.
 * The five largest groups keep a chart slot and everything else is Other. A group keeps its slot while it stays in
 * the top five, so a colour follows the entity and never its rank (design spec 3.3).
 */
export const RAY_COUNT = 100;
export const CHART_SLOT_COUNT = 5;

export type AllocationFacet = 'token' | 'network' | 'wallet';

export interface AllocationEntity {
  key: string;
  name: string;
  /** Fiat value; non-positive and non-finite values are left out. */
  value: number;
}

export interface AllocationGroup {
  key: string;
  name: string;
  value: number;
  /** Percent of the counted total, not rounded. */
  share: number;
  rays: number;
  /** 1 to CHART_SLOT_COUNT, or 0 for Other. */
  slot: number;
  /** For Other: the names folded into it. */
  members?: string[];
}

/** Entity key to chart slot, kept per scope and facet. */
export type SlotMap = Record<string, number>;

/**
 * Distributes `total` whole units over `values` in proportion, largest remainder first, so the parts always add up to
 * exactly `total` (a plain rounding can leave 99 or 101 rays).
 */
export function largestRemainder(values: readonly number[], total: number = RAY_COUNT): number[] {
  const sum = values.reduce((acc, value) => acc + value, 0);
  if (!(sum > 0) || values.length === 0) return values.map(() => 0);

  const raw = values.map((value) => (value / sum) * total);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((acc, part) => acc + part, 0);

  raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(({ index }) => {
      if (left <= 0) return;
      parts[index] += 1;
      left -= 1;
    });

  return parts;
}

/**
 * Keeps the slot of every key that is still in the top `slotCount`, gives each newcomer the lowest free slot in rank
 * order, and forgets the rest. A stored slot that is out of range or used twice is ignored.
 */
export function assignSlots(previous: SlotMap, rankedKeys: readonly string[], slotCount: number = CHART_SLOT_COUNT): SlotMap {
  const top = rankedKeys.slice(0, slotCount);
  const result: SlotMap = {};
  const used = new Set<number>();

  top.forEach((key) => {
    const slot = previous[key];
    if (Number.isInteger(slot) && slot >= 1 && slot <= slotCount && !used.has(slot)) {
      result[key] = slot;
      used.add(slot);
    }
  });

  let next = 1;
  top.forEach((key) => {
    if (key in result) return;
    while (used.has(next)) next += 1;
    result[key] = next;
    used.add(next);
  });

  return result;
}

export function buildAllocation(
  entities: readonly AllocationEntity[],
  previous: SlotMap = {}
): { groups: AllocationGroup[]; slots: SlotMap } {
  const ranked = entities
    .filter(({ value }) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  const total = ranked.reduce((acc, { value }) => acc + value, 0);
  if (!(total > 0)) return { groups: [], slots: {} };

  const slots = assignSlots(
    previous,
    ranked.map(({ key }) => key)
  );
  const head = ranked.slice(0, CHART_SLOT_COUNT);
  const tail = ranked.slice(CHART_SLOT_COUNT);
  type Entry = AllocationEntity & { slot: number; members?: string[] };
  const folded: Entry[] = tail.length
    ? [
        tail.length === 1
          ? { ...tail[0], slot: 0 }
          : {
              key: 'other',
              name: 'Other',
              value: tail.reduce((acc, { value }) => acc + value, 0),
              slot: 0,
              members: tail.map(({ name }) => name),
            },
      ]
    : [];
  const entries: Entry[] = [...head.map((entity) => ({ ...entity, slot: slots[entity.key] })), ...folded];
  const rays = largestRemainder(
    entries.map(({ value }) => value),
    RAY_COUNT
  );

  return {
    groups: entries.map((entry, index) => ({
      key: entry.key,
      name: entry.name,
      value: entry.value,
      share: (entry.value / total) * 100,
      rays: rays[index],
      slot: entry.slot,
      ...(entry.members ? { members: entry.members } : {}),
    })),
    slots,
  };
}
