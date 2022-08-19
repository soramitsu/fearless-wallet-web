export type AuthState = {
  requests: Record<string, string>[];
};

const state = (): AuthState => {
  return {
    requests: [],
  };
};

export default state;
