/**
 * Start the Next.js dev server for a browser test and stop it afterwards, including its child
 * processes (killing only the spawned shell leaves the dev server running).
 */

import { spawn, execSync } from "node:child_process";

export async function startServer(port) {
  const child = spawn("npx", ["next", "dev", "-p", String(port)], { shell: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const res = await fetch(`${url}/studio/try`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline || child.exitCode !== null) throw new Error(`next dev did not start:\n${log.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    url,
    close() {
      try {
        if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
        // elsewhere the shell, npx and next dev share one process group: stop all of it, or the
        // dev server keeps the pipes open and the test run never exits
        else process.kill(-child.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    },
  };
}
