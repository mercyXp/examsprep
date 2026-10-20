import type { Metadata } from "next";
import { Suspense } from "react";
import LoginExperience from "@/app/components/auth/LoginExperience";

export const metadata: Metadata = {
  title: "Sign in — ExamsPrep",
  description: "Sign in to ExamsPrep to continue your exam preparation.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginExperience />
    </Suspense>
  );
}
