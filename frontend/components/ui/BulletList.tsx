import type { HTMLAttributes, ReactNode } from "react";
import {
  textSizes,
  textTones,
  type TextSize,
  type TextTone,
} from "@/components/ui/Text";

export interface BulletListProps extends HTMLAttributes<HTMLUListElement> {
  size?: TextSize;
  tone?: TextTone;
  /** Elementy `li`. */
  children: ReactNode;
}

/** `BulletList` — lista wypunktowana w tym samym piśmie co `Text`. */
export default function BulletList({
  size = "body",
  tone = "ink",
  className = "",
  children,
  ...rest
}: BulletListProps) {
  return (
    <ul
      className={`flex max-w-2xl list-disc flex-col gap-2 pl-5 ${textSizes[size]} ${textTones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </ul>
  );
}
