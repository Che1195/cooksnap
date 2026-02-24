-- Allow multiple recipes per meal slot.
-- 1. Drop the old 1-recipe-per-slot constraint.
ALTER TABLE meal_plans DROP CONSTRAINT meal_plans_user_id_date_meal_type_key;

-- 2. Add position column for ordering within a slot.
ALTER TABLE meal_plans ADD COLUMN position smallint NOT NULL DEFAULT 0;

-- 3. Prevent the same recipe from appearing twice in the same slot.
ALTER TABLE meal_plans
  ADD CONSTRAINT meal_plans_user_slot_recipe_key
  UNIQUE (user_id, date, meal_type, recipe_id);
