import { api } from "@/lib/api";

export type StaffPerson = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: string;
};

export type StaffInvitation = {
  id: string;
  email: string;
  role: string;
  roleLabel: string;
  status: string;
  expiresAt: string | null;
  createdAt: string | null;
  acceptedAt: string | null;
};

export type StaffHistory = {
  id: string;
  action: string;
  at: string | null;
  actor: string;
  email: string;
  role: string;
};

export type StaffDirectory = {
  ok: true;
  people: StaffPerson[];
  invitations: StaffInvitation[];
  history: StaffHistory[];
};

export type IssuedInvitation = {
  ok: true;
  emailed: boolean;
  acceptUrl: string | null;
  invitation: StaffInvitation;
};

export async function loadStaff() {
  return api<StaffDirectory>("/api/admin/staff");
}

export async function inviteStaff(email: string, role: string) {
  return api<IssuedInvitation>("/api/admin/staff/invitations", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function resendStaffInvite(id: string) {
  return api<IssuedInvitation>(`/api/admin/staff/invitations/${id}/resend`, { method: "POST" });
}

export async function revokeStaffInvite(id: string) {
  return api<{ ok: true; invitation: StaffInvitation }>(`/api/admin/staff/invitations/${id}/revoke`, {
    method: "POST",
  });
}

export async function changeStaffRole(userId: string, role: string) {
  return api<{ ok: true }>(`/api/admin/staff/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function setStaffAccess(userId: string, active: boolean) {
  return api<{ ok: true }>(`/api/admin/staff/${userId}/access`, {
    method: "POST",
    body: JSON.stringify({ active }),
  });
}
