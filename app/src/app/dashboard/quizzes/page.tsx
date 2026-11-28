import { QuizBoard } from "@/app/components/assist/QuizBoard";
import AppShell from "@/app/components/shell/AppShell";

export const metadata = { title: "Quizzes — ExamsPrep" };

export default function QuizzesPage() {
  return (
    <AppShell variant="student" title="Quizzes & Mock Exams" subtitle="Published quizzes, with audio for the instructions, questions, options, and explanations.">
      <div className="dash-body">
        <QuizBoard />
      </div>
    </AppShell>
  );
}
