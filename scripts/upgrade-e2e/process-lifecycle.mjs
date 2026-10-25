/** Stop only the child this harness launched. A wedged browser must not hold the
 * upgrade report open forever, and a child already killed by a signal has no
 * exitCode even though its exit event has already fired. */
export async function stopOwnedProcess(child, { graceMs = 5000, forceMs = 5000 } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    let forceTimer;
    const finish = (error) => {
      clearTimeout(graceTimer);
      clearTimeout(forceTimer);
      child.removeListener('exit', onExit);
      child.removeListener('error', finish);
      error ? reject(error) : resolve();
    };
    const onExit = () => finish();
    const graceTimer = setTimeout(() => {
      forceTimer = setTimeout(() => finish(new Error('owned browser did not exit after SIGKILL')), forceMs);
      child.kill('SIGKILL');
    }, graceMs);
    child.once('exit', onExit);
    child.once('error', finish);
    child.kill('SIGTERM');
  });
}
