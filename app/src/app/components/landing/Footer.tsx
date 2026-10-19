import Image from "next/image";
import Link from "next/link";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/#courses", label: "Courses" },
  { href: "/#about", label: "About" },
  { href: "/#get-started", label: "Get started" },
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link href="/" className="footer-logo" aria-label="ExamsPrep home">
            <Image
              src="/logo/mark.png"
              alt=""
              width={340}
              height={340}
              className="footer-mark"
            />
            <span>ExamsPrep</span>
          </Link>
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
      <p className="footer-copy">© {new Date().getFullYear()} ExamsPrep. All rights reserved.</p>
    </footer>
  );
}
