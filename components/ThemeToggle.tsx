"use client";

import { useEffect, useState } from "react";

/**
 * Moon/sun toggle for the "Midnight" dark mode. The active theme is the `dark`
 * class on <html> (set before paint by the inline script in layout.tsx); this
 * button flips that class and persists the choice. The visible icon is swapped
 * purely in CSS off the same class, so it always matches the real theme and
 * never flashes. Local state only drives the accessible label/pressed value.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("pmw-theme", next ? "dark" : "light");
    } catch {
      // Private mode / storage disabled — the toggle still works for this session.
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      title="Toggle dark mode"
    >
      <svg className="ti-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      <svg className="ti-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    </button>
  );
}
