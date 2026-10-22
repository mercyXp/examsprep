import type { Metadata } from "next";
import { Suspense } from "react";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Choose a new password — ExamsPrep",
  description: "Set a new ExamsPrep password from your reset link.",
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="invite-fallback">Loading reset link…</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
