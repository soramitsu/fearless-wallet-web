import * as astar from './astar.json';

const settings = {
  astar,
};

export type Settings = keyof typeof settings;

export default settings;
