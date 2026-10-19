import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "BSc in Computing — ExamsPrep",
  description:
    "Bachelor of Science in Computing at Cavendish University Zambia — explore years, semesters, and modules for exam preparation.",
};

export default function ComputingLayout({ children }: { children: ReactNode }) {
  return children;
}
