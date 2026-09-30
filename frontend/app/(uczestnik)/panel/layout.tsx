import { RamkaUczestnika } from "@/app/(przelaczenie)/panel/RamkaUczestnika";

/**
 * Układ starej grupy tras uczestnika. Ramkę wybiera `RamkaUczestnika`:
 * dotychczasowy `PanelShell` (menu filtrowane rolą z `/me`) dla każdej
 * ścieżki poza stronami, które przy włączonej grupie przełączenia zamieniają
 * treść na ekran nowego frontu (te dostają nową ramkę z makiety).
 */
export default function ParticipantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RamkaUczestnika>{children}</RamkaUczestnika>;
}
