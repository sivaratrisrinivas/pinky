import { describe, expect, it } from "vitest";
import { pingUntilFound } from "./ping.js";

function run(replies: ({ found: boolean } | Error)[], delays = [100, 200, 400]) {
  const calls: number[] = [];
  const slept: number[] = [];
  let next = 0;
  const result = pingUntilFound(
    async () => {
      calls.push(next);
      const reply = replies[Math.min(next++, replies.length - 1)]!;
      if (reply instanceof Error) throw reply;
      return reply;
    },
    { delays, sleep: async (ms) => void slept.push(ms) }
  );
  return { result, calls, slept };
}

describe("pingUntilFound", () => {
  it("pings once when the app already sees the promise", async () => {
    const { result, calls, slept } = run([{ found: true }]);

    await result;

    expect(calls).toHaveLength(1);
    expect(slept).toEqual([]);
  });

  it("asks again with growing waits while the app can't see the promise yet", async () => {
    const { result, calls, slept } = run([{ found: false }, { found: false }, { found: true }]);

    await result;

    expect(calls).toHaveLength(3);
    expect(slept).toEqual([100, 200]);
  });

  it("retries after an error too", async () => {
    const { result, calls } = run([new Error("502"), { found: true }]);

    await result;

    expect(calls).toHaveLength(2);
  });

  it("gives up quietly after the last wait, even when every attempt failed", async () => {
    const { result, calls, slept } = run([new Error("down")]);

    await expect(result).resolves.toBeUndefined();

    expect(calls).toHaveLength(4);
    expect(slept).toEqual([100, 200, 400]);
  });
});
