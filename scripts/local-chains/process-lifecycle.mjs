import { spawn } from 'node:child_process';

/** Register ownership before waiting for readiness, including spawn and startup failures. */
export function spawnLocalProcess(command, args, options, cleanup) {
  const child = spawn(command, args, options);
  let spawnError;
  let stderr = '';

  child.on('error', (error) => { spawnError = error; });
  child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  cleanup.push(() => stopLocalProcess(child));

  return {
    child,
    assertRunning() {
      if (spawnError) throw new Error(`Unable to start ${command}: ${spawnError.message}`);
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`${command} exited before readiness (${child.exitCode ?? child.signalCode})${stderr ? `: ${stderr}` : ''}`);
      }
    },
    diagnostic() { return stderr; },
  };
}

export async function stopLocalProcess(child, graceMs = 15_000) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;

  await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), graceMs);

    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}
