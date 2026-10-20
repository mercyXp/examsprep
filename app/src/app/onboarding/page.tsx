import { Suspense } from "react";
import OnboardingExperience from "../components/onboarding/OnboardingExperience";

export const metadata = {
  title: "Set up your study plan — ExamsPrep",
};

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingExperience />
    </Suspense>
  );
}
