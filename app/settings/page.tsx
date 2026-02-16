import { SamsungNotesImport } from "@/components/conversations/samsung-notes-import";

export default function SettingsPage() {
  return (
    <div className="px-4 pt-6 space-y-6">
      <h1 className="text-2xl font-bold">설정</h1>

      {/* 삼성노트 가져오기 */}
      <section>
        <h2 className="text-lg font-semibold mb-3">삼성노트 가져오기</h2>
        <SamsungNotesImport />
      </section>

      {/* 카카오톡 알림 (Phase 4) */}
      <section>
        <h2 className="text-lg font-semibold mb-2">카카오톡 알림</h2>
        <p className="text-sm text-muted-foreground">
          Phase 4에서 구현됩니다.
        </p>
      </section>
    </div>
  );
}
