import { getGoogleWalletProgressState, MAX_GOOGLE_WALLET_FLOW_STEPS } from '@/helpers/googleWalletProgress';

describe('Google wallet progress contract', () => {
  it('treats the finish view as a terminal state rather than an extra progress circle', () => {
    expect(getGoogleWalletProgressState(4, 1)).toEqual({
      isFinishStep: false,
      isValid: true,
      steps: [
        { filled: true, number: 1 },
        { filled: false, number: 2 },
        { filled: false, number: 3 },
      ],
    });
    expect(getGoogleWalletProgressState(4, 3).steps.every(({ filled }) => filled)).toBe(true);
    expect(getGoogleWalletProgressState(4, 4)).toEqual({ isFinishStep: true, isValid: true, steps: [] });
    expect(getGoogleWalletProgressState(2, 1).steps).toEqual([{ filled: true, number: 1 }]);
  });

  it.each([
    [undefined, 1],
    [null, 1],
    [0, 1],
    [1, 1],
    [2.5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [MAX_GOOGLE_WALLET_FLOW_STEPS + 1, 1],
    [4, 0],
    [4, -1],
    [4, 1.5],
    [4, Number.NaN],
    [4, 5],
  ])('fails closed without allocating progress for count=%j step=%j', (countSteps, step) => {
    expect(getGoogleWalletProgressState(countSteps, step)).toEqual({
      isFinishStep: false,
      isValid: false,
      steps: [],
    });
  });
});
