import { type ReactNode } from "react";

const cssVariables = {
  "--bg-app": "#1a1a1a",
  "--bg-surface": "#222222",
  "--bg-elevated": "#2a2a2a",
  "--bg-hover": "#333333",
  "--text-primary": "#ffffff",
  "--text-secondary": "#8a8a8e",
  "--text-tertiary": "#5a5a5e",
  "--border-primary": "#333333",
  "--border-subtle": "#2a2a2a",
  "--accent-module": "#5e6ad2",
  "--accent-page": "#34d399",
  "--accent-field": "#f59e0b",
  "--accent-action": "#f472b6",
  "--accent-red": "#f87171",
  "--radius-sm": "6px",
  "--radius-md": "10px",
  "--radius-lg": "14px",
  "--font-sans":
    "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
} as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <div style={cssVariables as React.CSSProperties}>{children}</div>
  );
}
