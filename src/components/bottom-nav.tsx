"use client";

import { useRef, useEffect, useState, useCallback } from "react";
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

/**
 * Bottom navigation bar with a sliding pill indicator that animates
 * between tabs on navigation, giving instant visual feedback.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const cookingRecipeId = useRecipeStore((s) => s.cookingRecipeId);
  const uncheckedCount = useRecipeStore(
    (s) =>
      s.shoppingList.filter((i) => !i.checked).length +
      s.groceryList.filter((i) => !i.checked).length
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Pill position: left offset and fixed width (always matches widest tab)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const activeIndex = tabs.findIndex(({ href }) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)
  );

  /** Measure the active tab and set a uniform pill width based on the widest tab. */
  const updatePill = useCallback(() => {
    const container = containerRef.current;
    const activeEl = tabRefs.current[activeIndex];
    if (!container || !activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeEl.getBoundingClientRect();

    // Use the widest tab's width so the pill stays uniform across all tabs
    const maxWidth = Math.max(
      ...tabRefs.current.map((el) => el?.getBoundingClientRect().width ?? 0)
    );

    // Center the fixed-width pill on the active tab
    const tabCenter = tabRect.left + tabRect.width / 2 - containerRect.left;

    setPill({
      left: tabCenter - maxWidth / 2,
      width: maxWidth,
    });
  }, [activeIndex]);

  // Reposition pill when active tab changes or on resize
  useEffect(() => {
    updatePill();
    window.addEventListener("resize", updatePill);
    return () => window.removeEventListener("resize", updatePill);
  }, [updatePill]);

  // Don't render nav for unauthenticated users or while loading
  if (loading || !user) return null;

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-[env(safe-area-inset-bottom)]"
    >
      <div
        ref={containerRef}
        className="relative mx-auto flex h-16 max-w-lg items-center justify-around"
      >
        {/* Sliding pill indicator */}
        {pill && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 h-[calc(100%-12px)] rounded-xl bg-primary/10 transition-all duration-300 ease-out"
            style={{ left: pill.left, width: pill.width }}
          />
        )}

        {tabs.map(({ href, label, icon: Icon }, i) => {
          const isActive = i === activeIndex;
          const showCookingDot = href === "/cook" && cookingRecipeId !== null;
          const showShopBadge = href === "/shopping-list" && uncheckedCount > 0;
          return (
            <Link
              key={href}
              ref={(el) => { tabRefs.current[i] = el; }}
              href={href}
              prefetch={true}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative z-10 flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative">
                <Icon
                  className="h-5 w-5"
                  aria-hidden="true"
                />
                {showCookingDot && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                )}
                {showShopBadge && (
                  <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
                    {uncheckedCount > 99 ? "99+" : uncheckedCount}
                  </span>
                )}
              </span>
              <span className="font-medium">

                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
