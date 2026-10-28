type TokenResponse = {
  access_token?: string;
  error?: string;
};

type TokenClient = {
  requestAccessToken: (override?: { prompt?: string }) => void;
};

type GoogleAccounts = {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (response: TokenResponse) => void;
      error_callback?: (error: { type?: string }) => void;
    }) => TokenClient;
  };
};

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";
let loading: Promise<void> | null = null;

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    const finish = () => {
      if (window.google?.accounts?.oauth2) resolve();
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

export function preloadGoogleSignIn() {
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()) return;
  void loadGoogleIdentity().catch(() => undefined);
}

export async function requestGoogleCredential(clientId: string): Promise<string> {
  await loadGoogleIdentity();
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) throw new Error("Google sign-in could not be loaded.");

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, token?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (error || !token) reject(error ?? new Error("Google sign-in could not be completed."));
      else resolve(token);
    };
    const timer = window.setTimeout(() => {
      finish(new Error("Google sign-in timed out. Try again."));
    }, 120000);

    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: "openid email profile",
      callback: (response) => {
        if (response.access_token) {
          finish(null, response.access_token);
          return;
        }
        if (response.error === "popup_closed_by_user" || response.error === "access_denied") {
          finish(new Error("Google sign-in was closed."));
          return;
        }
        finish(new Error("Google sign-in could not be completed."));
      },
      error_callback: (error) => {
        if (error.type === "popup_failed_to_open") {
          finish(new Error("The Google window was blocked. Allow pop-ups for this site and try again."));
          return;
        }
        finish(new Error("Google sign-in was closed."));
      },
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}
