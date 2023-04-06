export type State = {
  authLogin: any;
};

const state = (): State => {
  return {
    authLogin: null,
  };
};

export default state;
