import type { HTMLAttributes, ReactNode } from "react";

export type TextSize = "body" | "small";
export type TextTone = "ink" | "muted" | "subtle";

/** Rozmiary i odcienie tekstu wspólne dla `Text` i `BulletList`. */
export const textSizes: Record<TextSize, string> = {
  body: "text-body",
  small: "text-small",
};

export const textTones: Record<TextTone, string> = {
  ink: "text-ink",
  muted: "text-muted",
  subtle: "text-subtle",
};

export interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  size?: TextSize;
  tone?: TextTone;
  children: ReactNode;
}

/**
 * `Text` — akapit treści. Szerokość wiersza jest ograniczona do wygodnej
 * do czytania (Z-5), więc strona nie ustawia jej sama.
 */
export default function Text({
  size = "body",
  tone = "ink",
  className = "",
  children,
  ...rest
}: TextProps) {
  return (
    <p
      className={`max-w-2xl text-pretty ${textSizes[size]} ${textTones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </p>
  );
}
