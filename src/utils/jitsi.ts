/**
 * Dynamically loads the Jitsi Meet External API script on demand.
 * Do NOT add to index.html statically — load only when a video call is needed.
 *
 * Guards:
 *  1. window.JitsiMeetExternalAPI already present → resolve immediately (already loaded)
 *  2. Script tag with id="jitsi-api-script" already in DOM → resolve immediately
 *     (prevents duplicate tags on concurrent calls before first load resolves)
 *
 * @param domain - Jitsi server domain (default: "meet.jit.si")
 */
export function loadJitsiScript(domain: string = 'meet.jit.si'): Promise<boolean> {
  return new Promise((resolve) => {
    // Fast path: SDK already initialised
    if ((window as unknown as Record<string, unknown>).JitsiMeetExternalAPI) {
      return resolve(true);
    }

    // Dedup guard: script tag already injected (concurrent calls or domain change)
    const existingScript = document.getElementById('jitsi-api-script') as HTMLScriptElement | null;
    if (existingScript) {
      // Wait for the in-flight load to finish
      existingScript.addEventListener('load', () => resolve(true), { once: true });
      existingScript.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'jitsi-api-script';
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error(`[Jitsi] Failed to load external API script from https://${domain}/external_api.js`);
      resolve(false);
    };
    document.body.appendChild(script);
  });
}
