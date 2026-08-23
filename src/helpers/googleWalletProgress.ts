type GoogleWalletProgressStep = {
  filled: boolean;
  number: number;
};

type GoogleWalletProgressState = {
  isFinishStep: boolean;
  isValid: boolean;
  steps: GoogleWalletProgressStep[];
};

const MAX_GOOGLE_WALLET_FLOW_STEPS = 32;

function getGoogleWalletProgressState(countSteps: unknown, step: unknown): GoogleWalletProgressState {
  const validCount =
    Number.isSafeInteger(countSteps) &&
    (countSteps as number) >= 2 &&
    (countSteps as number) <= MAX_GOOGLE_WALLET_FLOW_STEPS;
  const validStep = Number.isSafeInteger(step) && (step as number) >= 1;

  if (!validCount || !validStep || (step as number) > (countSteps as number)) {
    return { isFinishStep: false, isValid: false, steps: [] };
  }

  if (step === countSteps) {
    return { isFinishStep: true, isValid: true, steps: [] };
  }

  const progressStepCount = (countSteps as number) - 1;
  const steps = Array.from({ length: progressStepCount }, (_, index) => {
    const number = index + 1;

    return { filled: number <= (step as number), number };
  });

  return { isFinishStep: false, isValid: true, steps };
}

export { getGoogleWalletProgressState, MAX_GOOGLE_WALLET_FLOW_STEPS };
export type { GoogleWalletProgressState, GoogleWalletProgressStep };
