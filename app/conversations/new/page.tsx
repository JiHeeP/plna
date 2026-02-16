import { ConversationForm } from "@/components/conversations/conversation-form";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function NewConversationPage() {
  return (
    <div className="px-4 pt-6 space-y-4">
      <Link
        href="/conversations"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        돌아가기
      </Link>
      <ConversationForm />
    </div>
  );
}
