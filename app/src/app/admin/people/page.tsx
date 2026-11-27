"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import StaffPanel from "@/app/admin/staff/StaffPanel";
import StudentsPanel from "@/app/admin/students/StudentsPanel";
import { loadScope, type AdminScope } from "@/lib/cms";

function PeopleTabs() {
  const params = useSearchParams();
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    loadScope().then((result) => {
      if (!result.ok) {
        setFailed(result.message);
        return;
      }
      setScope(result.data);
    });
  }, []);

  const canStudents = Boolean(scope?.canManageStudents);
  const canStaff = Boolean(scope?.role === "super_administrator" || scope?.roles?.includes("super_administrator"));
  const requested = params.get("tab") === "staff" ? "staff" : "students";
  const tab = requested === "staff" && canStaff ? "staff" : canStudents ? "students" : canStaff ? "staff" : "students";

  return (
    <AppShell variant="admin" title="People" subtitle="Students and staff in one place.">
      {!scope ? (
        <p className="dash-empty">{failed || "Loading people…"}</p>
      ) : !canStudents && !canStaff ? (
        <p className="dash-card cms-note">Student and staff lists are limited to administrators.</p>
      ) : (
        <div className="dash-body cms-stack">
          <div className="dash-tabs" role="tablist" aria-label="People">
            {canStudents ? (
              <Link href="/admin/people?tab=students" role="tab" aria-selected={tab === "students"} className={tab === "students" ? "is-on" : undefined}>
                Students
              </Link>
            ) : null}
            {canStaff ? (
              <Link href="/admin/people?tab=staff" role="tab" aria-selected={tab === "staff"} className={tab === "staff" ? "is-on" : undefined}>
                Staff
              </Link>
            ) : null}
          </div>
          {tab === "staff" ? <StaffPanel /> : <StudentsPanel />}
        </div>
      )}
    </AppShell>
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<p className="dash-empty">Loading people…</p>}>
      <PeopleTabs />
    </Suspense>
  );
}
