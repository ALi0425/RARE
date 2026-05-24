import { theme } from "../../theme/tokens";

interface Props {
  size?: number;
  color?: string;
}

export default function Spinner({
  size = 16,
  color = theme.colors.accent.module,
}: Props) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `2px solid ${theme.colors.border.primary}`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "spin 0.6s linear infinite",
      }}
    />
  );
}
