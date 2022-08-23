type DAppRequests = string[];

export type State = {
  requests: DAppRequests;
};

const state = (): State => {
  return {
    requests: [],
  };
};

export default state;
