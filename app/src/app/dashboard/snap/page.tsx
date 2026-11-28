import { SnapDesk } from "@/app/components/assist/SnapDesk";
import AppShell from "@/app/components/shell/AppShell";

export const metadata = { title: "Snap a Question — ExamsPrep" };

export default function SnapPage() {
  return (
    <AppShell variant="student" title="Snap a Question" subtitle="Photograph a question and keep the working in My Questions.">
      <div className="dash-body">
        <SnapDesk />
      </div>
    </AppShell>
  );
}
