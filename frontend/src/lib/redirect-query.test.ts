import { describe, expect, it } from "vitest";
import { withQuery } from "./redirect-query";

describe("withQuery", () => {
  it("returns the target unchanged without parameters", () => {
    expect(withQuery("/dashboard/customs", {})).toBe("/dashboard/customs");
    expect(withQuery("/dashboard/customs", { a: undefined, b: "" })).toBe(
      "/dashboard/customs",
    );
  });

  it("keeps single and repeated parameters and encodes values", () => {
    expect(
      withQuery("/dashboard/inventory", {
        inventoryKeyword: "瓷砖 A",
        inventoryPage: "2",
      }),
    ).toBe(
      "/dashboard/inventory?inventoryKeyword=%E7%93%B7%E7%A0%96+A&inventoryPage=2",
    );
    expect(withQuery("/x", { s: ["a", "b"] })).toBe("/x?s=a&s=b");
  });
});
