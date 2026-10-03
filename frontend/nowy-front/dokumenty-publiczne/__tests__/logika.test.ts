import { describe, expect, it } from "vitest";
import { akapityTresci } from "../logika";

describe("akapity treści", () => {
  it("dzieli po pustej linii, obcina i pomija puste", () => {
    expect(akapityTresci("A\n\nB\n\n\n  \n\n C ")).toEqual(["A", "B", "C"]);
    expect(akapityTresci("Jedna linia\ndruga linia")).toEqual(["Jedna linia\ndruga linia"]);
    expect(akapityTresci("")).toEqual([]);
  });
});
