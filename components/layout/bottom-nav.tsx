"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Target, BarChart3, LayoutDashboard, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SITE_FEATURES, type SiteFeatures } from "@/lib/site-profile";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  /** 지정하면 해당 기능이 켜진 프로필에서만 보인다. */
  feature?: keyof SiteFeatures;
};

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "홈", icon: Home },
  { href: "/goals", label: "목표", icon: Target },
  { href: "/stats", label: "통계", icon: BarChart3 },
  { href: "/weekly-dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/conversations", label: "대화", icon: MessageCircle, feature: "conversations" },
];

const NAV_ITEMS = ALL_NAV_ITEMS.filter((item) => !item.feature || SITE_FEATURES[item.feature]);

export function BottomNav() {
  const pathname = usePathname();

  // 위젯 창은 좁은 창 하나로 쓰는 화면이라 내비게이션을 보여주지 않는다.
  if (pathname === "/widget") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-background/85 shadow-[0_-1px_12px_rgba(16,24,40,0.05)] backdrop-blur-md">
      <div
        className="mx-auto flex max-w-md items-stretch justify-around gap-1 px-2 pt-1.5 lg:max-w-6xl"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-[1.35rem] w-[1.35rem]", isActive && "stroke-[2.5]")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
