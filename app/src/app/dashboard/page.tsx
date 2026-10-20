import { Suspense } from "react";
import DashboardExperience from "../components/dashboard/DashboardExperience";

export const metadata = {
  title: "Dashboard — ExamsPrep",
};

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardExperience />
    </Suspense>
  );
}
