export const DEFAULT_TAGS = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Dessert",
  "Quick",
  "Vegetarian",
  "Vegan",
] as const;

export const SLOT_LABELS: Record<"breakfast" | "lunch" | "dinner", string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
