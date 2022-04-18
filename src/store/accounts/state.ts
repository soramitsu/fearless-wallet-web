export type State = {
  password: string;
};

const state = (): State => {
  return {
    password: '',
  };
};

export default state;
