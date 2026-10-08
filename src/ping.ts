/** Waits before each retry of the pay page's ping, in milliseconds. Four attempts over about 15 seconds. */
export const PING_DELAYS = [1000, 3000, 10000];

/**
 * Sends the pay page's ping until the app reports it found the promise on the chain. The app reads at
 * `confirmed` and can lag behind the page's own confirmation, so a first ping may find nothing. Errors count
 * as "not found yet". After the last wait it gives up without throwing: the promise is already made, and
 * opening the page again pings once more.
 */
export async function pingUntilFound(
  send: () => Promise<{ found: boolean }>,
  options: { delays?: number[]; sleep?: (ms: number) => Promise<void> } = {}
): Promise<void> {
  const { delays = PING_DELAYS, sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)) } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await send()).found) return;
    } catch {
      // Treated like "not found yet".
    }
    const wait = delays[attempt];
    if (wait === undefined) return;
    await sleep(wait);
  }
}
