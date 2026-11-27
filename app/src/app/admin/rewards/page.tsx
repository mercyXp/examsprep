"use client";

import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadScope, type AdminScope } from "@/lib/cms";
import { loadRewards, type BadgeAwardRow, type PrizePoolRow } from "@/lib/rewards";

function stamp(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

function labelKind(kind: string) {
  return kind.replaceAll("_", " ");
}

export default function RewardsPage() {
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [pools, setPools] = useState<PrizePoolRow[]>([]);
  const [badges, setBadges] = useState<BadgeAwardRow[]>([]);
  const [error, setError] = useState("");

  const allowed = Boolean(scope?.canViewRewards);

  useEffect(() => {
    loadScope().then(async (scopeResult) => {
      if (scopeResult.ok) setScope(scopeResult.data);
      if (!scopeResult.ok || !scopeResult.data.canViewRewards) return;
      const result = await loadRewards();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPools(result.data.pools ?? []);
      setBadges(result.data.badges ?? []);
    });
  }, []);

  return (
    <AppShell
      variant="admin"
      title="Rewards"
      subtitle="Solana badge awards and USDC prize pools. Programme administrators see pools for their own programs."
    >
      {!scope ? (
        <p className="dash-empty">Loading rewards…</p>
      ) : !allowed ? (
        <p className="dash-card cms-note">Only a super administrator or a program administrator can view rewards.</p>
      ) : (
        <div className="dash-body cms-stack">
          {error ? <p className="cms-error">{error}</p> : null}
          <section className="admin-panel">
            <h2>Prize pools</h2>
            {pools.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Pool</th>
                      <th>Program</th>
                      <th>Status</th>
                      <th>Period</th>
                      <th>Top</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pools.map((pool) => (
                      <tr key={pool.id}>
                        <td>{pool.title}</td>
                        <td>{pool.programmeName || "All programmes"}</td>
                        <td>
                          <span className={`admin-pill is-${pool.status}`}>{pool.status}</span>
                        </td>
                        <td>
                          {stamp(pool.periodStart)} – {stamp(pool.periodEnd)}
                        </td>
                        <td>{pool.topN}</td>
                        <td>{pool.totalAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dash-empty">No prize pools yet.</p>
            )}
          </section>
          <section className="admin-panel">
            <h2>Badge awards</h2>
            {badges.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Badge</th>
                      <th>Subject</th>
                      <th>Awarded</th>
                      <th>Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {badges.map((badge) => (
                      <tr key={badge.id}>
                        <td>
                          <strong>{badge.student || "Student"}</strong>
                          <div className="admin-note">{badge.email}</div>
                        </td>
                        <td>{labelKind(badge.kind)}</td>
                        <td>{badge.label}</td>
                        <td>{stamp(badge.awardedAt)}</td>
                        <td>{badge.tx ? `${badge.tx.slice(0, 8)}…` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dash-empty">No badges have been awarded yet.</p>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
