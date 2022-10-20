export type State = {
  qr: Nullable<string>;
};

const state = (): State => {
  return {
    qr: null,
  };
};

export default state;
