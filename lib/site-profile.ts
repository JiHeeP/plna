/**
 * 배포별 사이트 프로필.
 *
 * 같은 저장소로 여러 Vercel 프로젝트를 돌릴 때(본인용 / 가족용) 화면 구성을 갈라 쓰기 위한 스위치.
 * NEXT_PUBLIC_PLNA_PROFILE 환경 변수로 정하고, 빌드 시점에 인라인되므로 배포마다 다르게 줄 수 있다.
 * 변수가 없으면 "default" — 지금까지의 화면 그대로.
 *
 *   default  본인용 전체 기능
 *   mom      가족용 단순 버전: 확언·대화 없음, 목표는 이번 주/이번 달만, 할 일은 개인/모임
 */

export type SiteProfile = "default" | "mom";

export function resolveSiteProfile(value: string | null | undefined): SiteProfile {
  return value?.trim().toLowerCase() === "mom" ? "mom" : "default";
}

// process.env.NEXT_PUBLIC_… 는 이 형태 그대로 써야 Next가 브라우저 번들에 값을 넣어 준다.
export const SITE_PROFILE: SiteProfile = resolveSiteProfile(process.env.NEXT_PUBLIC_PLNA_PROFILE);

export type SiteFeatures = {
  /** 홈의 "오늘의 확언" 카드 */
  affirmation: boolean;
  /** 하단 "대화" 탭과 /conversations 화면 */
  conversations: boolean;
  /** 목표 화면의 3대 축·세부 목표·분기·마일스톤·수치 트래커. 꺼지면 이번 주/이번 달 목표만 남는다 */
  fullGoals: boolean;
};

export function siteFeaturesFor(profile: SiteProfile): SiteFeatures {
  const full = profile === "default";
  return { affirmation: full, conversations: full, fullGoals: full };
}

export const SITE_FEATURES = siteFeaturesFor(SITE_PROFILE);
