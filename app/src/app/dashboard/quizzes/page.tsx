import EmptyFeature from "@/app/components/dashboard/EmptyFeature";

export const metadata = { title: "Quizzes — ExamsPrep" };

export default function QuizzesPage() {
  return (
    <EmptyFeature
      title="Quizzes & Mock Exams"
      summary="Practice papers will live here once they are published."
      detail="No quizzes are published yet. When administrators release a mock exam, it will appear on this page with your attempt history."
    />
  );
}
