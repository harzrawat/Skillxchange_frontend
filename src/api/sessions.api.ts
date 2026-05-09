import { axiosInstance } from './axiosInstance';

// ─── Response shapes ─────────────────────────────────────────────────────────

export interface VideoCallData {
  sessionId: string;
  roomName: string;
  videoCallUrl: string;
  participant: {
    displayName: string;
    role: 'teacher' | 'learner';
  };
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Fetches room name, URL, and participant metadata for an active session.
 * Backend: GET /api/sessions/:id/video-call
 * Auth: required — only session teacher or learner.
 */
export async function apiGetVideoCallData(sessionId: string): Promise<VideoCallData> {
  const res = await axiosInstance.get<{ success: boolean; data: VideoCallData }>(
    `/api/sessions/${sessionId}/video-call`
  );
  return res.data.data;
}

/**
 * Notifies the backend that the local user has joined the video room.
 * Backend: POST /api/sessions/:id/join
 * Transitions session.status → "in_session" (idempotent).
 */
export async function apiNotifyJoin(sessionId: string): Promise<void> {
  await axiosInstance.post(`/api/sessions/${sessionId}/join`);
}

/**
 * Notifies the backend that the local user has left the video room.
 * Backend: POST /api/sessions/:id/leave
 * Best-effort — does not block the UI.
 */
export async function apiNotifyLeave(sessionId: string): Promise<void> {
  await axiosInstance.post(`/api/sessions/${sessionId}/leave`);
}

/**
 * Marks the session as fully complete (transfers credits / releases payment).
 * Backend: PUT /api/sessions/:id/complete
 */
export async function apiCompleteSessionFull(sessionId: string): Promise<void> {
  await axiosInstance.put(`/api/sessions/${sessionId}/complete`);
}
