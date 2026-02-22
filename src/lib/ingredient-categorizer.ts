// ---------------------------------------------------------------------------
// Ingredient Categorizer — group ingredients by grocery category
// ---------------------------------------------------------------------------

import { parseIngredient, type ParsedIngredient } from "./ingredient-parser";

// ---------------------------------------------------------------------------
// Categories (in display order)
// ---------------------------------------------------------------------------

export const INGREDIENT_CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Dry Goods & Baking",
  "Spices & Seasonings",
  "Oils & Condiments",
  "Canned & Jarred",
  "Grains & Pasta",
  "Nuts & Seeds",
  "Other",
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export interface CategorizedIngredient {
  originalIndex: number;
  raw: string;
  parsed: ParsedIngredient;
}

export interface IngredientGroup {
  category: IngredientCategory;
  items: CategorizedIngredient[];
}

// ---------------------------------------------------------------------------
// Keyword map — searched in priority order to resolve ambiguity
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: [IngredientCategory, string[]][] = [
  [
    "Oils & Condiments",
    [
      "oil",
      "olive oil",
      "vegetable oil",
      "canola oil",
      "sesame oil",
      "coconut oil",
      "vinegar",
      "soy sauce",
      "fish sauce",
      "hot sauce",
      "worcestershire",
      "mustard",
      "ketchup",
      "mayo",
      "mayonnaise",
      "dressing",
      "sriracha",
      "tahini",
      "mirin",
    ],
  ],
  [
    "Canned & Jarred",
    [
      "tomato paste",
      "tomato sauce",
      "canned",
      "diced tomatoes",
      "crushed tomatoes",
      "coconut milk",
      "coconut cream",
      "broth",
      "stock",
      "bouillon",
      "paste",
      "jarred",
      "salsa",
      "jam",
      "jelly",
      "preserves",
      "pickles",
      "olives",
      "capers",
      "anchov",
    ],
  ],
  [
    "Spices & Seasonings",
    [
      "salt",
      "pepper",
      "cumin",
      "paprika",
      "cinnamon",
      "nutmeg",
      "oregano",
      "basil",
      "thyme",
      "rosemary",
      "parsley",
      "cilantro",
      "dill",
      "bay leaf",
      "bay leaves",
      "chili powder",
      "cayenne",
      "turmeric",
      "coriander",
      "cardamom",
      "cloves",
      "ginger",
      "garlic powder",
      "onion powder",
      "seasoning",
      "spice",
      "herb",
      "vanilla extract",
      "vanilla",
      "extract",
      "mint",
      "sage",
      "tarragon",
      "chili flakes",
      "red pepper flakes",
      "curry powder",
      "garam masala",
      "saffron",
      "allspice",
      "fennel seed",
      "mustard seed",
      "celery seed",
    ],
  ],
  [
    "Nuts & Seeds",
    [
      "almond",
      "walnut",
      "pecan",
      "cashew",
      "peanut",
      "pistachio",
      "hazelnut",
      "macadamia",
      "pine nut",
      "sunflower seed",
      "pumpkin seed",
      "sesame seed",
      "chia seed",
      "flax seed",
      "flaxseed",
      "hemp seed",
      "poppy seed",
    ],
  ],
  [
    "Grains & Pasta",
    [
      "rice",
      "pasta",
      "spaghetti",
      "penne",
      "fettuccine",
      "linguine",
      "macaroni",
      "noodle",
      "couscous",
      "quinoa",
      "barley",
      "oat",
      "oats",
      "farro",
      "bulgur",
      "polenta",
      "cornmeal",
      "bread",
      "tortilla",
      "pita",
      "bun",
      "roll",
      "crouton",
      "breadcrumb",
      "panko",
    ],
  ],
  [
    "Meat & Seafood",
    [
      "chicken",
      "beef",
      "pork",
      "lamb",
      "turkey",
      "bacon",
      "sausage",
      "ham",
      "steak",
      "ground meat",
      "ground beef",
      "ground turkey",
      "ground pork",
      "shrimp",
      "salmon",
      "tuna",
      "cod",
      "tilapia",
      "crab",
      "lobster",
      "scallop",
      "mussel",
      "clam",
      "anchovy",
      "prosciutto",
      "pancetta",
      "chorizo",
      "fish",
      "seafood",
    ],
  ],
  [
    "Dairy & Eggs",
    [
      "milk",
      "cream",
      "butter",
      "cheese",
      "yogurt",
      "sour cream",
      "cream cheese",
      "egg",
      "eggs",
      "parmesan",
      "mozzarella",
      "cheddar",
      "feta",
      "ricotta",
      "gouda",
      "brie",
      "gruyere",
      "mascarpone",
      "whipping cream",
      "heavy cream",
      "half and half",
      "buttermilk",
      "ghee",
    ],
  ],
  [
    "Dry Goods & Baking",
    [
      "flour",
      "sugar",
      "brown sugar",
      "powdered sugar",
      "baking powder",
      "baking soda",
      "yeast",
      "cornstarch",
      "cocoa",
      "chocolate",
      "chocolate chip",
      "honey",
      "maple syrup",
      "molasses",
      "agave",
      "gelatin",
      "pectin",
    ],
  ],
  [
    "Produce",
    [
      "onion",
      "garlic",
      "tomato",
      "potato",
      "carrot",
      "celery",
      "bell pepper",
      "pepper",
      "lettuce",
      "spinach",
      "kale",
      "broccoli",
      "cauliflower",
      "zucchini",
      "squash",
      "mushroom",
      "corn",
      "pea",
      "peas",
      "bean",
      "green bean",
      "cucumber",
      "avocado",
      "lemon",
      "lime",
      "orange",
      "apple",
      "banana",
      "berry",
      "berries",
      "strawberry",
      "blueberry",
      "raspberry",
      "grape",
      "mango",
      "pineapple",
      "peach",
      "pear",
      "watermelon",
      "melon",
      "cherry",
      "plum",
      "fig",
      "cabbage",
      "asparagus",
      "artichoke",
      "eggplant",
      "radish",
      "turnip",
      "beet",
      "sweet potato",
      "jalape",
      "scallion",
      "shallot",
      "leek",
      "chive",
      "arugula",
      "romaine",
      "bok choy",
      "snap pea",
      "edamame",
    ],
  ],
];

// ---------------------------------------------------------------------------
// categorizeIngredient
// ---------------------------------------------------------------------------

export function categorizeIngredient(name: string): IngredientCategory {
  const lower = name.toLowerCase();

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }

  return "Other";
}

// ---------------------------------------------------------------------------
// groupIngredientsByCategory
// ---------------------------------------------------------------------------

export function groupIngredientsByCategory(
  ingredients: string[],
): IngredientGroup[] {
  const groupMap = new Map<IngredientCategory, CategorizedIngredient[]>();

  for (let i = 0; i < ingredients.length; i++) {
    const raw = ingredients[i];
    const parsed = parseIngredient(raw);
    const category = categorizeIngredient(parsed.name);

    let group = groupMap.get(category);
    if (!group) {
      group = [];
      groupMap.set(category, group);
    }
    group.push({ originalIndex: i, raw, parsed });
  }

  // Return in display order, omitting empty categories
  return INGREDIENT_CATEGORIES.filter((cat) => groupMap.has(cat)).map(
    (category) => ({
      category,
      items: groupMap.get(category)!,
    }),
  );
}
