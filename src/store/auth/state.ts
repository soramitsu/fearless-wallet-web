export type AuthState = {
  requests: string[];
};

const state = (): AuthState => {
  return {
    requests: [],
  };
};

export default state;
