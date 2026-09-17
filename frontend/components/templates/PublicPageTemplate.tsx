import type { ReactNode } from "react";
import type { PageHeaderProps } from "@/components/molecules/PageHeader";
import PageTemplate from "@/components/templates/PageTemplate";
import Logo from "@/components/ui/Logo";

export interface PublicPageTemplateProps {
  naglowek: PageHeaderProps;
  children?: ReactNode;
}

/**
 * `PublicPageTemplate` — szablon strony publicznej do czytania (bez
 * logowania i bez menu paneli): znak Fundacji, główny obszar treści
 * `#tresc` i kolumna tekstu wygodnej szerokości.
 */
export default function PublicPageTemplate({
  naglowek,
  children,
}: PublicPageTemplateProps) {
  return (
    <main
      id="tresc"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-stack px-4 py-10 sm:px-6"
    >
      <Logo className="h-10 w-auto self-start" />
      <PageTemplate naglowek={naglowek}>{children}</PageTemplate>
    </main>
  );
}
