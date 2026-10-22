import type { Metadata } from "next";
import { Suspense } from "react";
import InviteAccept from "./InviteAccept";

export const metadata: Metadata = {
  title: "Accept invitation — ExamsPrep",
  description: "Activate your ExamsPrep staff account.",
};

export default function InvitePage() {
  return (
    <Suspense fallback={<p className="invite-fallback">Loading invitation…</p>}>
      <InviteAccept />
    </Suspense>
  );
}
