import { api } from "@/lib/api";

export type PrizePoolRow = {
  id: string;
  title: string;
  programmeId: string | null;
  programmeName?: string;
  periodStart: string;
  periodEnd: string;
  topN: number;
  status: string;
  totalAmount: number;
  mint: string;
  payouts: Array<{ rank: number; displayName: string; amount: number; note: string }>;
};

export type BadgeAwardRow = {
  id: string;
  kind: string;
  label: string;
  student: string;
  email: string;
  tx: string | null;
  awardedAt: string | null;
};

export async function loadRewards() {
  return api<{ pools: PrizePoolRow[]; badges: BadgeAwardRow[] }>("/api/admin/rewards");
}
