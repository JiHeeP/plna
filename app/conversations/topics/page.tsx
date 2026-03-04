import { TopicManager } from "@/components/conversations/topic-manager";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function TopicsPage() {
  return (
    <div className="px-4 pt-6 space-y-4">
      <Link
        href="/conversations"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        돌아가기
      </Link>
      <h1 className="text-2xl font-bold">만능대화소재</h1>
      <TopicManager />
    </div>
  );
}
