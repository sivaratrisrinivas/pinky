import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "./signature.js";

const sign = (secret: string, body: string) =>
  "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

describe("verifySignature", () => {
  it("accepts a body signed with the secret", () => {
    expect(verifySignature("s3cret", '{"a":1}', sign("s3cret", '{"a":1}'))).toBe(true);
  });

  it("rejects a body signed with another secret", () => {
    expect(verifySignature("s3cret", '{"a":1}', sign("other", '{"a":1}'))).toBe(false);
  });

  it("rejects a tampered body", () => {
    expect(verifySignature("s3cret", '{"a":2}', sign("s3cret", '{"a":1}'))).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifySignature("s3cret", "{}", null)).toBe(false);
    expect(verifySignature("s3cret", "{}", "sha256=zz")).toBe(false);
  });
});
