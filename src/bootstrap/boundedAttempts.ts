export interface BoundedAttempts {
  attempts: number;
  retryDelaysMs: number[];
}

// Run `attempt` until it succeeds, at most `attempts` times, waiting between tries. A try
// starts only after the previous one settled, so two never run at once. The last failure
// is rethrown for the caller to report.
export async function boundedAttempts(attempt: () => Promise<void>, { attempts, retryDelaysMs }: BoundedAttempts): Promise<void> {
  for (let tried = 1; ; tried++) {
    try {
      await attempt();

      return;
    } catch (error) {
      if (tried >= attempts) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[Math.min(tried, retryDelaysMs.length) - 1] ?? 0));
  }
}

// Wait for `work` for at most `timeoutMs`, then fail with `message`. The work itself keeps
// running, so a later caller can wait for the same result again.
export function withDeadline<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
