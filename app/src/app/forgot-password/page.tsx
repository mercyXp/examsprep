import type { Metadata } from "next";
import { Suspense } from "react";
import ForgotPasswordExperience from "@/app/components/auth/ForgotPasswordExperience";

export const metadata: Metadata = {
  title: "Forgot password — ExamsPrep",
  description: "Reset your ExamsPrep password.",
};

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordExperience />
    </Suspense>
  );
}
