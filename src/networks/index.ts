import * as astar from './astar.json';

const settings = {
  astar,
};

export type KeySettings = keyof typeof settings;

export default settings;
