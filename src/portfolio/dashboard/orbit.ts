/**
 * The geometry of the orbit in Where it lives (design spec 4.4), in CSS px: the token's orb in the middle, a ring in
 * perspective, one satellite per network, and the Polkaswap node at the top right. It is a picture of the holdings
 * list below it, which stays the accessible truth.
 */
export interface OrbitGeometry {
  w: number;
  h: number;
  /** The orb's centre; the ring is an ellipse about it. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  orb: number;
  satellite: number;
  /** The Polkaswap node's centre. */
  swap: { x: number; y: number };
  swapSize: number;
  /** More networks than this fold into one "more" satellite. */
  maxSatellites: number;
}

export const POPUP_ORBIT: OrbitGeometry = {
  w: 529,
  // The design's orbit is 252 high; the popup is only 600, so the empty space above the ring is trimmed.
  h: 224,
  cx: 238,
  cy: 116,
  rx: 176,
  ry: 70,
  orb: 64,
  satellite: 38,
  swap: { x: 470, y: 38 },
  swapSize: 44,
  maxSatellites: 7,
};

export interface OrbitSatellite {
  index: number;
  x: number;
  y: number;
  /** Nearer satellites are drawn a little larger: 0.86 at the back of the ring, 1 at the front. */
  scale: number;
  /** On the near half of the ring, so it is drawn over the orb's links. */
  front: boolean;
}

// Angles run clockwise on screen: 0 is the ring's right-hand end, 90 the front (bottom), 180 the left-hand end. A few
// satellites sit across the front, where the eye is; more spread round towards the top left. The top-right quarter is
// always left to the Polkaswap node.
const ANGLES: Readonly<Record<number, readonly number[]>> = {
  1: [90],
  2: [50, 130],
  3: [30, 90, 150],
  4: [15, 70, 125, 180],
  5: [0, 50, 100, 150, 200],
  6: [-10, 35, 80, 125, 170, 215],
  7: [-15, 25, 65, 105, 145, 185, 225],
};

const round = (value: number): number => Math.round(value * 10) / 10;
const roundScale = (value: number): number => Math.round(value * 100) / 100;

/** Where the satellites go, in order round the ring from the right-hand end, across the front, to the left. */
export function orbitLayout(count: number, geometry: OrbitGeometry = POPUP_ORBIT): OrbitSatellite[] {
  const total = Math.min(Math.max(Math.floor(count), 0), geometry.maxSatellites);

  return (ANGLES[total] ?? []).map((degrees, index) => {
    const radians = (degrees * Math.PI) / 180;
    const depth = (Math.sin(radians) + 1) / 2;

    return {
      index,
      x: round(geometry.cx + geometry.rx * Math.cos(radians)),
      y: round(geometry.cy + geometry.ry * Math.sin(radians)),
      scale: roundScale(0.86 + 0.14 * depth),
      front: Math.sin(radians) >= 0,
    };
  });
}

/** The networks that get a satellite, largest first, and how many are folded into the last one. */
export function orbitNetworks<T>(networks: readonly T[], geometry: OrbitGeometry = POPUP_ORBIT): { shown: T[]; folded: T[] } {
  if (networks.length <= geometry.maxSatellites) return { shown: [...networks], folded: [] };

  // The last satellite is the "more" one, so it takes the place of the smallest shown network too.
  return { shown: networks.slice(0, geometry.maxSatellites - 1), folded: networks.slice(geometry.maxSatellites - 1) };
}
