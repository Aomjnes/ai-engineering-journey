import { describe, expect, it } from "vitest";
import { isSameOrigin, verifyCronSecret } from "@/lib/ingest/auth";

describe("cron endpoint auth", () => {
  const secret = "s3cret-value-0123456789";
  it("requires a configured secret and a matching bearer token", () => {
    expect(verifyCronSecret(`Bearer ${secret}`, undefined)).toBe("unconfigured");
    expect(verifyCronSecret(null, secret)).toBe("denied");
    expect(verifyCronSecret("Bearer wrong", secret)).toBe("denied");
    expect(verifyCronSecret(secret, secret)).toBe("denied");
    expect(verifyCronSecret(`Bearer ${secret}`, secret)).toBe("ok");
  });
  it("accepts manual sync only from the same origin", () => {
    const mk = (h: Record<string, string>) => new Request("http://localhost:3000/api/ingest", { method: "POST", headers: h });
    expect(isSameOrigin(mk({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(isSameOrigin(mk({ origin: "https://evil.example", host: "localhost:3000" }))).toBe(false);
    expect(isSameOrigin(mk({ host: "localhost:3000" }))).toBe(false);
  });
});
