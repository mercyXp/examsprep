"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/app/components/landing/Header";
import Footer from "@/app/components/landing/Footer";

const AUTH_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuth = AUTH_PATHS.has(pathname);
  const isApp = pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding");
  const chrome = isAuth ? "is-auth" : isApp ? "is-app" : "";

  return (
    <div className={chrome ? `page-shell ${chrome}` : "page-shell"}>
      {isAuth || isApp ? null : (
        <Suspense>
          <Header />
        </Suspense>
      )}
      <main id="main-content">{children}</main>
      {isAuth || isApp ? null : <Footer />}
    </div>
  );
}
