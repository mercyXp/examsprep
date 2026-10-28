type GoogleCredential = { credential?: string };

type PromptMoment = {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getDismissedReason: () => string;
};

type GoogleIdentity = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredential) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: { type: string; theme: string; size: string; text: string }) => void;
  prompt: (listener?: (notification: PromptMoment) => void) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";
let loading: Promise<void> | null = null;

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    const finish = () => {
      if (window.google?.accounts?.id) resolve();
      else {
        loading = null;
        reject(new Error("Google sign-in could not be loaded."));
      }
    };
    script.onload = finish;
    script.onerror = () => {
      loading = null;
      reject(new Error("Google sign-in could not be loaded."));
    };
    if (!existing) {
      script.src = SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    } else {
      finish();
    }
  });
  return loading;
}

function clickRenderedButton(host: HTMLElement) {
  const button = host.querySelector<HTMLElement>("[role='button']");
  button?.click();
  return Boolean(button);
}

export async function requestGoogleCredential(clientId: string): Promise<string> {
  await loadGoogleIdentity();
  const identity = window.google?.accounts?.id;
  if (!identity) throw new Error("Google sign-in could not be loaded.");

  return new Promise((resolve, reject) => {
    let settled = false;
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.position = "fixed";
    host.style.left = "-9999px";
    host.style.top = "0";
    document.body.appendChild(host);

    const finish = (error: Error | null, credential?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      host.remove();
      if (error || !credential) reject(error ?? new Error("Google did not return a sign-in."));
      else resolve(credential);
    };

    const timer = window.setTimeout(() => {
      finish(new Error("Google sign-in timed out. Try again."));
    }, 120000);

    identity.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
      callback: (response) => {
        if (response.credential) finish(null, response.credential);
        else finish(new Error("Google did not return a sign-in."));
      },
    });

    identity.renderButton(host, { type: "standard", theme: "outline", size: "large", text: "continue_with" });
    if (clickRenderedButton(host)) return;

    window.requestAnimationFrame(() => {
      if (settled) return;
      if (clickRenderedButton(host)) return;
      identity.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          finish(new Error("Google sign-in could not be shown. Check that this site is allowed in Google Cloud."));
          return;
        }
        if (notification.isDismissedMoment() && notification.getDismissedReason() !== "credential_returned") {
          finish(new Error("Google sign-in was closed."));
        }
      });
    });
  });
}
