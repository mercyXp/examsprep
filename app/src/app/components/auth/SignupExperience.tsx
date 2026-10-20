"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/app/components/ui/Button";
import ThemeToggle from "@/app/components/ui/ThemeToggle";
import LoginCast, { type CastMood } from "@/app/components/auth/LoginCast";
import { createAccount, signInWithGoogle } from "@/lib/auth";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.593.102-1.17.282-1.709V4.958H.957C.347 6.173 0 7.548 0 9c0 1.452.348 2.827.957 4.042l3.007-2.335z"
      />
      <path
        fill="#EA4335"
        d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z"
      />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 8.5c1.6 2.2 3.6 3.2 6 3.2s4.4-1 6-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return <span className="login-spinner" aria-hidden="true" />;
}

export default function SignupExperience() {
  const router = useRouter();
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<"name" | "email" | "password" | null>(null);
  const [submitting, setSubmitting] = useState<"form" | "google" | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const shakeOff = useRef(0);
  const navOff = useRef(0);

  let mood: CastMood = "idle";
  if (success) mood = "success";
  else if (submitting) mood = "load";
  else if (error) mood = "error";
  else if (showPassword) mood = "peek";
  else if (focused === "password") mood = "cover";
  else if (focused === "email" || focused === "name") mood = "watch";

  useEffect(() => {
    const shakeId = shakeOff;
    const navId = navOff;
    return () => {
      window.clearTimeout(shakeId.current);
      window.clearTimeout(navId.current);
    };
  }, []);

  const fail = (message: string) => {
    setError(message);
    setShake(true);
    window.clearTimeout(shakeOff.current);
    shakeOff.current = window.setTimeout(() => setShake(false), 820);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || success) return;

    const nextName = name.trim();
    const nextEmail = email.trim();
    if (!nextName || !nextEmail || !password) {
      fail("Enter your name, email, and password.");
      return;
    }
    if (password.length < 8) {
      fail("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirm) {
      fail("Those passwords don’t match.");
      return;
    }

    setSubmitting("form");
    setError("");

    try {
      const result = await createAccount(nextName, nextEmail, password);
      if (result.ok) {
        setSuccess(true);
        navOff.current = window.setTimeout(() => router.replace("/dashboard"), 900);
        return;
      }
      fail(result.message);
    } catch {
      fail("Something went wrong. Please try again.");
    } finally {
      setSubmitting(null);
    }
  };

  const onGoogle = async () => {
    if (submitting || success) return;
    setSubmitting("google");
    setError("");

    try {
      const result = await signInWithGoogle();
      if (result.ok) {
        setSuccess(true);
        navOff.current = window.setTimeout(() => router.replace("/dashboard"), 900);
        return;
      }
      fail(result.message);
    } catch {
      fail("Something went wrong. Please try again.");
    } finally {
      setSubmitting(null);
    }
  };

  const busy = Boolean(submitting) || success;

  return (
    <section className="login-shell is-signup" data-mood={mood} aria-labelledby="signup-title">
      <div className="login-art">
        <LoginCast mood={mood} shake={shake} />
      </div>

      <div className="login-panel">
        <div className="login-panel-top">
          <Link href="/" className="login-brand" aria-label="ExamsPrep home">
            <Image src="/logo/mark.png" alt="" width={340} height={340} priority className="logo-mark" />
            <span className="login-wordmark">ExamPrep</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="login-copy">
          <h1 id="signup-title" className="login-title">
            Create account
          </h1>
          <p className="login-lede">Start preparing in a few details</p>
        </div>

        <form
          className="login-form"
          onSubmit={onSubmit}
          aria-busy={submitting || undefined}
          noValidate
          onFocusCapture={(event) => {
            const field = (event.target as HTMLElement).getAttribute("name");
            if (field === "name" || field === "email") setFocused(field);
            if (field === "password" || field === "confirm") setFocused("password");
          }}
          onBlurCapture={(event) => {
            const next = event.relatedTarget as HTMLElement | null;
            if (next && event.currentTarget.contains(next)) return;
            setFocused(null);
          }}
        >
          {error ? (
            <p className="login-error" id={errorId} role="alert">
              {error}
            </p>
          ) : null}

          <div className="login-field">
            <label htmlFor={nameId}>Name</label>
            <input
              id={nameId}
              className={error ? "login-input is-error" : "login-input"}
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onFocus={() => setFocused("name")}
              onBlur={() => setFocused((current) => (current === "name" ? null : current))}
              onChange={(event) => {
                setFocused("name");
                setName(event.target.value);
                if (error) setError("");
              }}
            />
          </div>

          <div className="login-field">
            <label htmlFor={emailId}>Email</label>
            <input
              id={emailId}
              className={error ? "login-input is-error" : "login-input"}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused((current) => (current === "email" ? null : current))}
              onChange={(event) => {
                setFocused("email");
                setEmail(event.target.value);
                if (error) setError("");
              }}
            />
          </div>

          <div className="login-field">
            <label htmlFor={passwordId} className={error ? "is-error" : undefined}>
              Password
            </label>
            <div className="login-password">
              <input
                id={passwordId}
                className={error ? "login-input is-error" : "login-input"}
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="new-password"
                value={password}
                disabled={busy}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused((current) => (current === "password" ? null : current))}
                onChange={(event) => {
                  setFocused("password");
                  setPassword(event.target.value);
                  if (error) setError("");
                }}
              />
              <button
                type="button"
                className="login-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => setShowPassword((open) => !open)}
              >
                <EyeIcon open={!showPassword} />
              </button>
            </div>
          </div>

          <div className="login-field">
            <label htmlFor={confirmId} className={error ? "is-error" : undefined}>
              Confirm password
            </label>
            <input
              id={confirmId}
              className={error ? "login-input is-error" : "login-input"}
              type={showPassword ? "text" : "password"}
              name="confirm"
              autoComplete="new-password"
              value={confirm}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused((current) => (current === "password" ? null : current))}
              onChange={(event) => {
                setFocused("password");
                setConfirm(event.target.value);
                if (error) setError("");
              }}
            />
          </div>

          <Button type="submit" className="login-submit" disabled={busy}>
            {submitting === "form" ? (
              <>
                <Spinner />
                Creating account
              </>
            ) : (
              "Create account"
            )}
          </Button>

          <Button type="button" variant="outline" className="login-google" disabled={busy} onClick={onGoogle}>
            {submitting === "google" ? (
              <>
                <Spinner />
                Continuing
              </>
            ) : (
              <>
                <GoogleMark />
                Continue with Google
              </>
            )}
          </Button>
        </form>

        <p className="login-foot">
          Already have an account?{" "}
          <Link className="text-link" href="/login">
            Log in
          </Link>
        </p>
      </div>
    </section>
  );
}
