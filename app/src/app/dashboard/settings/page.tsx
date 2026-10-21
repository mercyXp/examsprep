"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { getSessionUser, signOut, type SessionUser } from "@/lib/auth";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSessionUser().then((session) => {
      if (session) setUser(session);
    });
  }, []);

  return (
    <AppShell variant="student" title="Settings" subtitle="Your account details from onboarding.">
      <div className="dash-body cms-stack">
        <article className="dash-card">
          <dl className="cms-dl">
            <div>
              <dt>Name</dt>
              <dd>{user?.name || "—"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user?.email || "—"}</dd>
            </div>
            <div>
              <dt>Programme</dt>
              <dd>{user?.programme || "—"}</dd>
            </div>
            <div>
              <dt>Year / semester</dt>
              <dd>
                {user?.yearOfStudy ?? "—"} / {user?.semesterOfStudy ?? "—"}
              </dd>
            </div>
          </dl>
          <p className="dash-empty">Use the sidebar to switch theme or sign out. Theme is shared across the app.</p>
          <button
            type="button"
            className="dash-primary"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </article>
      </div>
    </AppShell>
  );
}
