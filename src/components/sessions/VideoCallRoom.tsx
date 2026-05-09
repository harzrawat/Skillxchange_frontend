import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, PhoneOff, Clock, AlertCircle, Wifi } from 'lucide-react';
import { loadJitsiScript } from '../../utils/jitsi';
import { apiNotifyJoin, apiNotifyLeave } from '../../api/sessions.api';

// ─── Types ─────────────────────────────────────────────────────────────────

interface VideoCallRoomProps {
  /** Jitsi room name (e.g. "skillxchange-<uuid>") */
  roomName: string;
  /** Display name shown inside the Jitsi iframe */
  displayName: string;
  /** SkillXchange session ID — used for join/leave API calls */
  sessionId: string;
  /** Called after the user has left or ended the call */
  onCallEnd?: () => void;
}

// ─── Narrow Jitsi API type (avoids any-casting throughout) ─────────────────

type JitsiAPI = {
  addEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
  dispose: () => void;
};

type JitsiMeetExternalAPICtor = new (domain: string, options: unknown) => JitsiAPI;

// ─── Helper ─────────────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * VideoCallRoom
 *
 * Embeds a Jitsi Meet iframe inside a custom SkillXchange UI shell.
 *
 * Lifecycle:
 *   mount      → loadJitsiScript() → new JitsiMeetExternalAPI() → show spinner
 *   joined     → POST /join + start MM:SS timer + hide spinner
 *   "End Call" → api.dispose() + onCallEnd()
 *   left event → POST /leave + stop timer + onCallEnd()
 *   unmount    → stopTimer() + api.dispose() (cleanup)
 */
export function VideoCallRoom({
  roomName,
  displayName,
  sessionId,
  onCallEnd,
}: VideoCallRoomProps) {
  // Refs — stable across renders, prevent double-initialisation
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiAPI | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialisedRef = useRef(false); // guard against StrictMode double-effect

  // UI state
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(false);
  const [duration, setDuration] = useState(0); // seconds elapsed since join
  const [error, setError] = useState<string | null>(null);

  const domain = import.meta.env.VITE_JITSI_DOMAIN || 'meet.jit.si';

  // ── Timer helpers ────────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    if (timerRef.current) return; // idempotent
    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Jitsi initialisation ─────────────────────────────────────────────────

  useEffect(() => {
    // Prevent double-init in React 18 StrictMode (double-mount in dev)
    if (initialisedRef.current) return;
    initialisedRef.current = true;

    async function initJitsi() {
      if (!jitsiContainerRef.current) return;

      // 1. Load the Jitsi external API script dynamically
      const loaded = await loadJitsiScript(domain);
      if (!loaded) {
        setError('Could not load video call. Check your internet connection and try again.');
        setLoading(false);
        return;
      }

      // 2. Grab the constructor injected by the script onto window
      const JitsiMeetExternalAPI = (
        window as unknown as Record<string, unknown>
      ).JitsiMeetExternalAPI as JitsiMeetExternalAPICtor | undefined;

      if (!JitsiMeetExternalAPI) {
        setError('Jitsi API not available. Please refresh the page.');
        setLoading(false);
        return;
      }

      // 3. Build options
      const options = {
        roomName,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainerRef.current,
        userInfo: { displayName },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'desktop', 'fullscreen',
            'hangup', 'chat', 'raisehand', 'tileview', 'settings',
          ],
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          DEFAULT_BACKGROUND: '#0f172a',
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          disableModeratorIndicator: false,
          enableNoisyMicDetection: true,
        },
      };

      // 4. Create API instance — stored in ref, never re-created
      const api = new JitsiMeetExternalAPI(domain, options);
      apiRef.current = api;

      // ── Event: local user has entered the conference ─────────────────────
      api.addEventListener('videoConferenceJoined', async () => {
        setLoading(false);
        setJoined(true);
        startTimer();

        // Best-effort — notify backend; failure must not block the UI
        try {
          await apiNotifyJoin(sessionId);
        } catch (err) {
          console.warn('[VideoCallRoom] POST /join failed (non-fatal):', err);
        }
      });

      // ── Event: local user left the conference ────────────────────────────
      api.addEventListener('videoConferenceLeft', async () => {
        stopTimer();

        try {
          await apiNotifyLeave(sessionId);
        } catch (err) {
          console.warn('[VideoCallRoom] POST /leave failed (non-fatal):', err);
        }

        onCallEnd?.();
      });

      // ── Event: a remote participant left (reserved for future UX) ─────────
      api.addEventListener('participantLeft', () => {
        // Could surface "Other participant has left the call" toast here
      });
    }

    initJitsi();

    // ── Cleanup on unmount ───────────────────────────────────────────────
    return () => {
      stopTimer();
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once — roomName/displayName/sessionId are stable for the lifetime of this mount

  // ── "End Call" button handler ────────────────────────────────────────────

  function handleEndCall() {
    stopTimer();
    if (apiRef.current) {
      apiRef.current.dispose();
      apiRef.current = null;
    }
    onCallEnd?.();
  }

  // ── Error state ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-red-900/40 bg-slate-900 px-8 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
          <AlertCircle className="h-7 w-7 text-red-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-white">Video call unavailable</p>
          <p className="mt-1 text-sm text-slate-400">{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-medium text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-700"
        >
          Refresh page
        </button>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">

      {/* ── Controls bar — visible only after joining ── */}
      {joined && (
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 shadow-lg">

          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              Live
            </span>
          </div>

          {/* MM:SS duration timer */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <Clock className="h-4 w-4 text-slate-500" />
            <span className="font-mono text-sm font-medium tabular-nums">
              {formatDuration(duration)}
            </span>
          </div>

          {/* End Call button */}
          <button
            id="end-call-btn"
            onClick={handleEndCall}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white shadow transition hover:bg-red-500 active:scale-95"
          >
            <PhoneOff className="h-4 w-4" />
            End Call
          </button>
        </div>
      )}

      {/* ── Jitsi iframe container ── */}
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
        style={{ minHeight: '540px' }}
      >


        {/* Jitsi mounts into this div via parentNode option */}
        <div
          ref={jitsiContainerRef}
          id="jitsi-meet-container"
          className="w-full"
          style={{ height: '540px' }}
        />
      </div>
    </div>
  );
}
