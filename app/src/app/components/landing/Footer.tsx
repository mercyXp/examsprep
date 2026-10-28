import Link from "next/link";
import BrandLogo from "@/app/components/ui/BrandLogo";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/#programmes", label: "Programmes" },
  { href: "/#about", label: "About" },
  { href: "/signup", label: "Get started" },
  { href: "/privacy", label: "Privacy policy" },
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <BrandLogo className="footer-logo" />
          <p>
            Structured revision for Cavendish University Zambia students — study plans, quizzes, and mock exams in one place.
          </p>
        </div>

        <nav className="footer-nav" aria-label="Footer">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="footer-copy">© 2026 ExamsPrep. All rights reserved.</p>
    </footer>
  );
}
