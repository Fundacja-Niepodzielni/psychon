import {
  Home, BookOpen, Clock, Users, File, Award, MessageSquare,
  Inbox, BarChart, Settings, HelpCircle, User, LogOut, Lock,
} from "lucide-react";
import type { SVGProps } from "react";

type WlasciwosciGlifu = SVGProps<SVGSVGElement> & { color?: string; strokeWidth?: number };

/** Glif „menu” — ścieżka z makiety 2.0.4 (przycisk `#mbtn`), te same atrybuty kreski co glify lucide. */
function GlifMenu({ color, strokeWidth, ...reszta }: WlasciwosciGlifu) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...reszta}
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

const MAPA_IKON = {
  home: Home,
  book: BookOpen,
  clock: Clock,
  users: Users,
  file: File,
  award: Award,
  chat: MessageSquare,
  inbox: Inbox,
  chart: BarChart,
  cog: Settings,
  help: HelpCircle,
  user: User,
  out: LogOut,
  lock: Lock,
  menu: GlifMenu,
} as const;

export type NazwaIkony = keyof typeof MAPA_IKON;

interface WlasciwosciIcon {
  nazwa: NazwaIkony;
  rozmiar?: 16 | 18 | 26;
}

/**
 * Ikona `Icon` (A12). Jeden plik, jeden glif pod jedną nazwą. Zawsze
 * `aria-hidden` — ikona nigdy nie jest jedynym nośnikiem znaczenia, obok niej
 * zawsze stoi tekst.
 */
export function Icon({ nazwa, rozmiar = 18 }: WlasciwosciIcon) {
  const Glif = MAPA_IKON[nazwa];
  return <Glif aria-hidden="true" width={rozmiar} height={rozmiar} strokeWidth={1.8} color="currentColor" />;
}
