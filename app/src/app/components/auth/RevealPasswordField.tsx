"use client";

import { useId, useState } from "react";

type RevealPasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  name: string;
  minLength?: number;
};

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

export default function RevealPasswordField({
  label,
  value,
  onChange,
  autoComplete,
  name,
  minLength = 8,
}: RevealPasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="invite-field">
      <label htmlFor={id}>{label}</label>
      <div className="invite-secret">
        <input
          id={id}
          type={visible ? "text" : "password"}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={minLength}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="invite-secret-toggle"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((open) => !open)}
        >
          <EyeIcon open={!visible} />
        </button>
      </div>
    </div>
  );
}
