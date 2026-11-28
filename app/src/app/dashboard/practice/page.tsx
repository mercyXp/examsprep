import { PracticeDesk } from "@/app/components/assist/PracticeDesk";
import AppShell from "@/app/components/shell/AppShell";

export const metadata = { title: "Practice — ExamsPrep" };

export default function PracticePage() {
  return (
    <AppShell
      variant="student"
      title="Practice"
      subtitle="Questions generated from published lessons. They stay separate from official exams."
    >
      <div className="dash-body">
        <PracticeDesk />
      </div>
    </AppShell>
  );
}
