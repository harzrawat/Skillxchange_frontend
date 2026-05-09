/**
 * Dynamically loads the Razorpay checkout script on demand.
 * Do NOT add to index.html statically — load only when payment is needed.
 *
 * Guards:
 *  1. window.Razorpay already present → resolve immediately (already loaded)
 *  2. Script tag with id="razorpay-script" already in DOM → resolve immediately
 *     (prevents duplicate tags on concurrent calls before first load resolves)
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    // Fast path: SDK already initialised
    if ((window as unknown as Record<string, unknown>).Razorpay) {
      return resolve(true);
    }

    // Dedup guard: script tag already injected (concurrent calls)
    if (document.getElementById("razorpay-script")) {
      // Wait for the in-flight load to finish
      const existing = document.getElementById("razorpay-script") as HTMLScriptElement;
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "razorpay-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
