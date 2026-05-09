import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { VideoCallRoom } from "../../components/sessions/VideoCallRoom";
import { AppShell } from "../../components/layout/AppShell";
import { apiGetVideoCallData } from "../../api/sessions.api";
import { useAuthStore } from "../../store/authStore";
import toast from "react-hot-toast";

export default function ClassroomPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuthStore();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["video-call", sessionId],
    queryFn: () => apiGetVideoCallData(sessionId!),
    enabled: !!sessionId,
    retry: false,
  });

  function handleCallEnd() {
    toast("Session ended. Mark it as complete when ready.");
    navigate("/sessions");
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (isError) {
    const msg = (error as { response?: { data?: { error?: string } } })
      ?.response?.data?.error ?? "Unable to load classroom";
    const is403 = msg.toLowerCase().includes("authorized") || msg.toLowerCase().includes("403");

    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <Lock className="h-10 w-10 text-red-400" />
          <h2 className="text-lg font-semibold text-gray-800">
            {is403 ? "Access Denied" : "Classroom Unavailable"}
          </h2>
          <p className="text-sm text-gray-500 max-w-xs">{msg}</p>
          <button
            onClick={() => navigate("/sessions")}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Back to sessions
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Live Classroom</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            You are joined as <span className="font-medium text-indigo-600">{data?.participant.displayName}</span>
            {" "}({data?.participant.role})
          </p>
        </div>

        {data && (
          <VideoCallRoom
            roomName={data.roomName}
            displayName={user?.name ?? data.participant.displayName}
            sessionId={sessionId!}
            onCallEnd={handleCallEnd}
          />
        )}
      </div>
    </AppShell>
  );
}
