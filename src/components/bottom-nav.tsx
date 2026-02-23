"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, CalendarDays, ShoppingCart, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { useRecipeStore } from "@/stores/recipe-store";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/meal-plan", label: "Plan", icon: CalendarDays },
  { href: "/cook", label: "Cook", icon: Flame },
  { href: "/shopping-list", label: "Shop", icon: ShoppingCart },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const cookingRecipeId = useRecipeStore((s) => s.cookingRecipeId);
  const uncheckedCount = useRecipeStore(
    (s) => s.shoppingList.filter((i) => !i.checked).length
  );

  // Don't render nav for unauthenticated users or while loading
  if (loading || !user) return null;

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          const showCookingDot = href === "/cook" && cookingRecipeId !== null;
          const showShopBadge = href === "/shopping-list" && uncheckedCount > 0;
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {showCookingDot && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                )}
                {showShopBadge && (
                  <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
                    {uncheckedCount > 99 ? "99+" : uncheckedCount}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
