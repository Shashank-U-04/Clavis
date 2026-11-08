/**
 * Start the Next.js dev server for a browser test and stop it afterwards, including its child
 * processes (on Windows `kill` alone leaves the compiler running).
 */

import { spawn, execSync } from "node:child_process";

export async function startServer(port) {
  const child = spawn("npx", ["next", "dev", "-p", String(port)], { shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
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
        else child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    },
  };
}
