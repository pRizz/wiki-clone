import { describe, expect, it } from "vitest";
import { applyKarmaDecay, buildEventFingerprint } from "./service.js";

describe("applyKarmaDecay", () => {
  it("returns unchanged score during grace period", () => {
    const now = new Date("2026-03-05T00:00:00.000Z");
    const created = new Date("2026-03-01T00:00:00.000Z");

    const result = applyKarmaDecay({
      positive: 100,
      userCreatedAt: created,
      now,
      decay: {
        enabled: true,
        graceDays: 14,
        weeklyRatePct: 1,
        floor: 0,
      },
    });

    expect(result).toBe(100);
  });

  it("applies weekly decay after grace period", () => {
    const now = new Date("2026-03-29T00:00:00.000Z");
    const created = new Date("2026-03-01T00:00:00.000Z");

    const result = applyKarmaDecay({
      positive: 100,
      userCreatedAt: created,
      now,
      decay: {
        enabled: true,
        graceDays: 14,
        weeklyRatePct: 10,
        floor: 0,
      },
    });

    expect(result).toBe(81);
  });
});

describe("buildEventFingerprint", () => {
  it("creates stable fingerprints independent of key order", () => {
    const first = buildEventFingerprint({
      userId: 5,
      actorUserId: 2,
      eventType: "revision_upvoted",
      reason: "same reason",
      metadata: {
        targetType: "revision",
        targetId: 9,
      },
    });

    const second = buildEventFingerprint({
      userId: 5,
      actorUserId: 2,
      eventType: "revision_upvoted",
      reason: "same reason",
      metadata: {
        targetId: 9,
        targetType: "revision",
      },
    });

    expect(first).toBe(second);
  });
});
