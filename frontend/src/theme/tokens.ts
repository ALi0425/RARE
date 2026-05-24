export const theme = {
  colors: {
    bg: {
      app: "#1a1a1a",
      surface: "#222222",
      elevated: "#2a2a2a",
      hover: "#333333",
      overlay: "rgba(0,0,0,0.6)",
    },
    text: {
      primary: "#ffffff",
      secondary: "#8a8a8e",
      tertiary: "#5a5a5e",
      inverse: "#1a1a1a",
    },
    border: {
      primary: "#333333",
      subtle: "#2a2a2a",
      focus: "#5e6ad2",
    },
    accent: {
      module: "#5e6ad2",
      page: "#34d399",
      field: "#f59e0b",
      action: "#f472b6",
      red: "#f87171",
    },
    node: {
      module: { border: "rgba(94,106,210,0.3)", bg: "rgba(94,106,210,0.08)" },
      page: { border: "rgba(52,199,137,0.3)", bg: "rgba(52,199,137,0.08)" },
      field: { border: "rgba(245,158,11,0.3)", bg: "rgba(245,158,11,0.08)" },
      action: { border: "rgba(244,114,182,0.3)", bg: "rgba(244,114,182,0.08)" },
    },
    diff: {
      new: "#34d399",
      impacted: "#f87171",
    },
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
  },
  font:
    "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
  shadow: {
    sm: "0 1px 3px rgba(0,0,0,0.3)",
    md: "0 4px 24px rgba(0,0,0,0.4)",
    lg: "0 8px 40px rgba(0,0,0,0.5)",
    glow: (color: string) => `0 0 12px ${color}40`,
  },
  transition: "0.15s ease",
} as const;

export type Theme = typeof theme;
