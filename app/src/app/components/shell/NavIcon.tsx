const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;

export type NavIconName =
  | "home"
  | "book"
  | "cal"
  | "quiz"
  | "cards"
  | "chart"
  | "spark"
  | "bell"
  | "gear"
  | "people"
  | "lessons"
  | "bank"
  | "megaphone"
  | "logout";

export function NavIcon({ name }: { name: NavIconName }) {
  if (name === "home") {
    return (
      <svg {...common}>
        <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "book") {
    return (
      <svg {...common}>
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "cal") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "quiz") {
    return (
      <svg {...common}>
        <path d="M8 7h8M8 12h5M7 4h10a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "cards") {
    return (
      <svg {...common}>
        <rect x="5" y="7" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg {...common}>
        <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "spark") {
    return (
      <svg {...common}>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.2 6.2l2.8 2.8M15 15l2.8 2.8M17.8 6.2 15 9M9 15l-2.8 2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "bell") {
    return (
      <svg {...common}>
        <path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2H4.5zM10 20h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "gear") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 4.5v1.6M12 17.9v1.6M4.5 12h1.6M17.9 12h1.6M6.4 6.4l1.1 1.1M16.5 16.5l1.1 1.1M17.6 6.4l-1.1 1.1M7.5 16.5l-1.1 1.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "people") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 19a5 5 0 0 1 10 0M16 11a3 3 0 1 0 0-6M20 19a4.5 4.5 0 0 0-4-4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "lessons") {
    return (
      <svg {...common}>
        <path d="M6 5h12v14H6zM9 9h6M9 13h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "bank") {
    return (
      <svg {...common}>
        <path d="M5 8h14l-7-4zM6 10v7M12 10v7M18 10v7M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "megaphone") {
    return (
      <svg {...common}>
        <path d="M5 10v4h3l6 4V6l-6 4H5zM17 9.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "logout") {
    return (
      <svg {...common}>
        <path d="M10 12h10M16 8l4 4-4 4M13 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 7h8M8 12h8M8 17h5M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
