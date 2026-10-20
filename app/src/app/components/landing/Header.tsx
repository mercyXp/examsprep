"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import Button from "@/app/components/ui/Button";
import ThemeToggle from "@/app/components/ui/ThemeToggle";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/#programmes", label: "Programmes" },
  { href: "/#about", label: "About" },
];

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13.2 13.2 16.5 16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const menuId = useId();
  const searchId = useId();
  const searchRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (media.matches) setMenuOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [searchOpen]);

  useEffect(() => {
    if (!menuOpen || !menuRef.current) return;
    const menu = menuRef.current;
    const focusable = Array.from(
      menu.querySelectorAll<HTMLElement>("a, button, input"),
    );

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (wasOpen.current && !menuOpen) {
      menuButtonRef.current?.focus();
    }
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={stuck ? "site-header is-stuck" : "site-header"}>
      {menuOpen ? (
        <button type="button" className="menu-backdrop" aria-label="Close menu" onClick={closeMenu} />
      ) : null}

      <div className="header-bar">
        <Link href="/" className="logo" aria-label="ExamsPrep home">
          <span className="logo-crop theme-light">
            <Image
              src="/logo/logo_light.png"
              alt=""
              width={2336}
              height={908}
              priority
              className="logo-lockup"
            />
          </span>
          <span className="logo-dark theme-dark">
            <Image
              src="/logo/mark.png"
              alt=""
              width={340}
              height={340}
              priority
              className="logo-mark"
            />
            <span className="logo-wordmark" aria-hidden="true">
              ExamPrep
            </span>
          </span>
        </Link>

        <nav className="nav-desktop" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <form
            ref={searchRef}
            role="search"
            className={searchOpen ? "search is-open" : "search"}
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="sr-only" htmlFor={searchId}>
              Search
            </label>
            <input
              ref={searchInputRef}
              id={searchId}
              type="search"
              placeholder="Search courses"
              className="search-input"
              tabIndex={searchOpen ? 0 : -1}
              aria-hidden={searchOpen ? undefined : true}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-expanded={searchOpen}
              aria-controls={searchId}
              onClick={() => setSearchOpen((open) => !open)}
            >
              <span className="sr-only">{searchOpen ? "Close search" : "Search"}</span>
              <SearchIcon />
            </button>
          </form>

          <ThemeToggle />

          <Link href="/login" className="header-signin">
            Sign in
          </Link>

          <Button href="/#get-started" className="header-cta">
            Get started
          </Button>

          <button
            ref={menuButtonRef}
            type="button"
            className="btn btn-ghost btn-icon menu-toggle"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div ref={menuRef} id={menuId} className="mobile-menu">
          <nav aria-label="Mobile">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="mobile-link" onClick={closeMenu}>
                {item.label}
              </Link>
            ))}
          </nav>
          <Button href="/#get-started" onClick={closeMenu}>
            Get started
          </Button>
          <Link href="/login" className="mobile-signin" onClick={closeMenu}>
            Sign in
          </Link>
        </div>
      ) : null}
    </header>
  );
}
