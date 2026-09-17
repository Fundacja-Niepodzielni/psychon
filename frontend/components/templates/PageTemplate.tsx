import type { ReactNode } from "react";
import PageHeader, { type PageHeaderProps } from "@/components/molecules/PageHeader";

export interface PageTemplateProps {
  naglowek: PageHeaderProps;
  /** Treść ekranu pod nagłówkiem, ułożona w pionie ze stałym odstępem. */
  children?: ReactNode;
}

/**
 * `PageTemplate` — szablon ekranu, który nie jest listą: nagłówek strony
 * i bloki treści pod nim, w jednym rytmie odstępów. Ekran nie pisze już
 * własnego układu ani własnego `h1`.
 */
export default function PageTemplate({ naglowek, children }: PageTemplateProps) {
  return (
    <div className="flex flex-col gap-stack">
      <PageHeader {...naglowek} />
      {children}
    </div>
  );
}
