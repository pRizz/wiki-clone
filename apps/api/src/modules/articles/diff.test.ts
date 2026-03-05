import { describe, expect, it } from "vitest";
import { buildLineDiff } from "./diff.js";

describe("buildLineDiff", () => {
  it("marks unchanged and added lines", () => {
    const result = buildLineDiff("alpha\nbeta", "alpha\nbeta\ngamma");

    expect(result).toEqual([
      { type: "unchanged", text: "alpha" },
      { type: "unchanged", text: "beta" },
      { type: "added", text: "gamma" },
    ]);
  });

  it("marks removed lines", () => {
    const result = buildLineDiff("one\ntwo\nthree", "one\nthree");

    expect(result).toEqual([
      { type: "unchanged", text: "one" },
      { type: "removed", text: "two" },
      { type: "unchanged", text: "three" },
    ]);
  });
});
