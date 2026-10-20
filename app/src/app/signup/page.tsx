import type { Metadata } from "next";
import { Suspense } from "react";
import SignupExperience from "@/app/components/auth/SignupExperience";

export const metadata: Metadata = {
  title: "Create account — ExamsPrep",
  description: "Create an ExamsPrep account to start preparing for your exams.",
};

export default function SignupPage() {
  return (
    <Suspense>
      <SignupExperience />
    </Suspense>
  );
}
