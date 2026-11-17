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

  // 폰: 화면 아래 탭 막대. 넓은 화면(lg 이상): 왼쪽 사이드 메뉴.
  // data-nav는 본문(main)이 사이드 메뉴 폭만큼 비켜서도록 알려주는 표시다(layout.tsx의 peer-data 참고).
  return (
    <nav
      data-nav="on"
      className="peer fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-background/85 shadow-[0_-1px_12px_rgba(120,60,40,0.05)] backdrop-blur-md lg:top-0 lg:right-auto lg:w-56 lg:border-t-0 lg:border-r lg:bg-card lg:shadow-none lg:backdrop-blur-none"
    >
      <div className="hidden lg:block px-7 pt-7 pb-6 text-xl font-extrabold tracking-wide text-primary">PLNA</div>
      <div
        className="mx-auto flex max-w-md items-stretch justify-around gap-1 px-2 pt-1.5 lg:mx-0 lg:max-w-none lg:flex-col lg:justify-start lg:px-3 lg:pt-0"
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
                "flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium transition-colors lg:flex-none lg:flex-row lg:gap-3 lg:px-4 lg:py-2.5 lg:text-[15px]",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-[1.35rem] w-[1.35rem] lg:h-5 lg:w-5", isActive && "stroke-[2.5]")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
