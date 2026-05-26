import { useState } from "react";
import { theme } from "../../theme/tokens";

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

// ── SVG icons (24×24) ──

const IconAssets = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconReview = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);

const IconEvaluate = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const IconVersions = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
);

const items: MenuItem[] = [
  { id: "assets", label: "资产管理", icon: <IconAssets /> },
  { id: "review", label: "审核画布", icon: <IconReview /> },
  { id: "evaluate", label: "智能评估", icon: <IconEvaluate /> },
  { id: "versions", label: "版本管理", icon: <IconVersions /> },
];

interface Props {
  activeItem: string;
  onSelect: (id: string) => void;
}

export default function CanvasSideMenu({ activeItem, onSelect }: Props) {
  const [hovered, setHovered] = useState(false);
  const expanded = hovered;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: expanded ? 190 : 56,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: theme.colors.bg.surface,
        borderRight: `1px solid ${theme.colors.border.subtle}`,
        padding: "12px 6px",
        transition: `width 0.2s ease`,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {items.map((item) => {
        const active = activeItem === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              border: "none",
              borderRadius: 10,
              background: active ? `${theme.colors.accent.module}20` : "transparent",
              color: active
                ? theme.colors.accent.module
                : theme.colors.text.secondary,
              cursor: "pointer",
              fontFamily: theme.font,
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              whiteSpace: "nowrap",
              transition: `all 0.15s ease`,
              width: "100%",
              textAlign: "left",
            }}
            title={item.label}
          >
            <span style={{ flexShrink: 0, display: "flex" }}>
              {item.icon}
            </span>
            <span
              style={{
                opacity: expanded ? 1 : 0,
                transition: `opacity 0.15s ease`,
                overflow: "hidden",
                fontSize: 13,
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
