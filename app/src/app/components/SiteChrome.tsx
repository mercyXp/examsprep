"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/app/components/landing/Header";
import Footer from "@/app/components/landing/Footer";

const AUTH_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuth = AUTH_PATHS.has(pathname);

  return (
    <div className={isAuth ? "page-shell is-auth" : "page-shell"}>
      {isAuth ? null : (
        <Suspense>
          <Header />
        </Suspense>
      )}
      <main id="main-content">{children}</main>
      {isAuth ? null : <Footer />}
    </div>
  );
}
