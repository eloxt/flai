import { useParams } from "react-router";
import Chat from "./chat/Chat";
import { useAuthStore } from "@/store/auth-store";
export { meta } from "./chat/Chat";

export default function ChatPage() {
    const { conversationId } = useParams();
    const userId = useAuthStore((state) => state.user?.id);
    return <Chat key={`${userId}:${conversationId}`} />;
}
