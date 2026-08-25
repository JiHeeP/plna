import { WidgetBoard } from "@/components/widget/widget-board";

export const metadata = {
  title: "PLNA 위젯",
};

/**
 * 창 하나로 띄워 쓰는 위젯 화면.
 * 크롬의 "바로가기 만들기 → 창으로 열기"로 띄우면 바탕화면 위젯처럼 쓸 수 있고,
 * 폰에서는 홈 화면 바로가기로 같은 주소를 쓴다.
 */
export default function WidgetPage() {
  // 루트 레이아웃이 하단 내비게이션 자리를 pb-20으로 비워 두는데,
  // 위젯 창에는 내비게이션이 없으므로 그 여백을 되돌린다.
  return (
    <div className="-mb-20">
      <WidgetBoard />
    </div>
  );
}
