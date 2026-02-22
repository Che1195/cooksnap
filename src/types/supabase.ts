export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          image: string | null;
          source_url: string;
          prep_time: string | null;
          cook_time: string | null;
          total_time: string | null;
          servings: string | null;
          author: string | null;
          cuisine_type: string | null;
          difficulty: "Easy" | "Medium" | "Hard" | null;
          rating: number | null;
          is_favorite: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          image?: string | null;
          source_url?: string;
          prep_time?: string | null;
          cook_time?: string | null;
          total_time?: string | null;
          servings?: string | null;
          author?: string | null;
          cuisine_type?: string | null;
          difficulty?: "Easy" | "Medium" | "Hard" | null;
          rating?: number | null;
          is_favorite?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          image?: string | null;
          source_url?: string;
          prep_time?: string | null;
          cook_time?: string | null;
          total_time?: string | null;
          servings?: string | null;
          author?: string | null;
          cuisine_type?: string | null;
          difficulty?: "Easy" | "Medium" | "Hard" | null;
          rating?: number | null;
          is_favorite?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_ingredients: {
        Row: {
          id: string;
          recipe_id: string;
          text: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          text: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          text?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_instructions: {
        Row: {
          id: string;
          recipe_id: string;
          text: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          text: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          text?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_instructions_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_tags: {
        Row: {
          id: string;
          recipe_id: string;
          tag: string;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          tag: string;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          tag?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_tags_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plans: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          meal_type: "breakfast" | "lunch" | "dinner";
          recipe_id: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          meal_type: "breakfast" | "lunch" | "dinner";
          recipe_id: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          meal_type?: "breakfast" | "lunch" | "dinner";
          recipe_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_plans_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_items: {
        Row: {
          id: string;
          user_id: string;
          text: string;
          checked: boolean;
          recipe_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          text: string;
          checked?: boolean;
          recipe_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          text?: string;
          checked?: boolean;
          recipe_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_items_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      checked_ingredients: {
        Row: {
          id: string;
          user_id: string;
          recipe_id: string;
          ingredient_index: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          recipe_id: string;
          ingredient_index: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          recipe_id?: string;
          ingredient_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: "checked_ingredients_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checked_ingredients_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
