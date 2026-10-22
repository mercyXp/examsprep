"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import BrandLogo from "@/app/components/ui/BrandLogo";
import Button from "@/app/components/ui/Button";
import ThemeToggle from "@/app/components/ui/ThemeToggle";
import LoginCast, { type CastMood } from "@/app/components/auth/LoginCast";
import { requestPasswordReset } from "@/lib/auth";

function Spinner() {
  return <span className="login-spinner" aria-hidden="true" />;
}

export default function ForgotPasswordExperience() {
  const emailId = useId();
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [shake, setShake] = useState(false);
  const shakeOff = useRef(0);

  let mood: CastMood = "idle";
  if (submitting) mood = "load";
  else if (error) mood = "error";
  else if (focused === "email") mood = "watch";

  useEffect(() => {
    const id = shakeOff;
    return () => window.clearTimeout(id.current);
  }, []);

  const fail = (message: string) => {
    setError(message);
    setShake(true);
    window.clearTimeout(shakeOff.current);
    shakeOff.current = window.setTimeout(() => setShake(false), 820);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const nextEmail = email.trim();
    if (!nextEmail) {
      fail("Enter your email.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const result = await requestPasswordReset(nextEmail);
      if (!result.ok) fail(result.message);
      else setSent(result.message);
    } catch {
      fail("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="login-shell" data-mood={mood} aria-labelledby="forgot-title">
      <div className="login-art">
        <LoginCast mood={mood} shake={shake} />
      </div>

      <div className="login-panel">
        <div className="login-panel-top">
          <BrandLogo className="login-brand" priority />
          <ThemeToggle />
        </div>

        <div className="login-copy">
          <h1 id="forgot-title" className="login-title">
            Forgot password?
          </h1>
          <p className="login-lede">Enter your email and we’ll send a reset link.</p>
        </div>

        {sent ? (
          <p className="login-lede">{sent}</p>
        ) : (
        <form className="login-form" onSubmit={onSubmit} aria-busy={submitting || undefined} noValidate>
          {error ? (
            <p className="login-error" id={errorId} role="alert">
              {error}
            </p>
          ) : null}

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
              disabled={submitting}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              onChange={(event) => {
                setFocused("email");
                setEmail(event.target.value);
                if (error) setError("");
              }}
            />
          </div>

          <Button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner />
                Sending
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
        )}

        <p className="login-foot">
          Remember it?{" "}
          <Link className="text-link" href="/login">
            Log in
          </Link>
        </p>
      </div>
    </section>
  );
}
