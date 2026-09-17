import Link from "next/link";
import type { ComponentProps } from "react";

export type TextLinkTone = "primary" | "muted";

export interface TextLinkProps extends ComponentProps<typeof Link> {
  tone?: TextLinkTone;
}

const tones: Record<TextLinkTone, string> = {
  primary: "font-medium text-primary hover:text-primary-hover",
  muted: "text-muted hover:text-ink",
};

/**
 * `TextLink` — odnośnik w treści. Zawsze podkreślony i zawsze z polem
 * dotyku co najmniej 44 px (Z-10), także w wierszu tabeli.
 */
export default function TextLink({
  tone = "primary",
  className = "",
  ...rest
}: TextLinkProps) {
  return (
    <Link
      className={`inline-flex min-h-control min-w-control items-center underline underline-offset-4 transition-colors duration-150 ease-out-quint focus-visible:focus-ring ${tones[tone]} ${className}`}
      {...rest}
    />
  );
}
