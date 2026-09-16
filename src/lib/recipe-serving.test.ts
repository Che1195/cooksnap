import { describe, expect, it } from "vitest";
import { exactServings, servingLabel } from "./recipe-serving";

describe("serving control semantics", () => {
  it.each(["4-6", "4 to 6 servings", "Makes 12 muffins", "about 4", "", null])(
    "uses factor controls for %s",
    (value) => {
      expect(exactServings(value)).toBeNull();
    },
  );
  it.each(["4", "4 servings", "Serves 4"])(
    "uses serving controls for %s",
    (value) => {
      expect(exactServings(value)).toBe(4);
      expect(servingLabel(value, 0.5)).toBe("2 servings");
    },
  );
  it("keeps original range readable without claiming a lower-bound yield", () => {
    expect(servingLabel("4–6 servings", 2)).toBe(
      "2× recipe · Original yield: 4–6 servings",
    );
  });
});
