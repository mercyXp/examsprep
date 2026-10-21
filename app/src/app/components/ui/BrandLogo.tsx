import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  className?: string;
  priority?: boolean;
};

export default function BrandLogo({ href = "/", className = "", priority = false }: BrandLogoProps) {
  return (
    <Link href={href} className={`brand-logo${className ? ` ${className}` : ""}`} aria-label="ExamsPrep home">
      <Image src="/logo/mark.png" alt="" width={40} height={40} priority={priority} className="brand-logo-mark" />
      <Image src="/logo/word.png" alt="" width={160} height={28} priority={priority} className="brand-logo-word" />
    </Link>
  );
}
