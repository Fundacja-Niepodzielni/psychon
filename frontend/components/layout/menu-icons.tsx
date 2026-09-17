import {
  Award,
  BadgeCheck,
  BookOpen,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Flag,
  FolderOpen,
  History,
  House,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  MessageCircleQuestion,
  MessagesSquare,
  PanelTop,
  Rocket,
  Settings,
  User,
  Users,
} from "lucide-react";
import type { MenuIcon, MenuIconName } from "@/lib/menu/types";

/**
 * Ikony menu paneli — jedna rodzina liniowych SVG (lucide-react, licencja
 * ISC). Ikona jest ozdobą: lucide dodaje `aria-hidden="true"`, a nazwą
 * dostępną linku zostaje jego etykieta. Kolor dziedziczy z linku
 * (`currentColor`), rozmiar z `className`.
 */
export const menuIcons: Record<MenuIconName, MenuIcon> = {
  rocket: Rocket,
  dashboard: LayoutDashboard,
  book: BookOpen,
  users: Users,
  "clipboard-list": ClipboardList,
  "clipboard-check": ClipboardCheck,
  lifebuoy: LifeBuoy,
  "file-text": FileText,
  award: Award,
  "badge-check": BadgeCheck,
  user: User,
  clock: Clock,
  messages: MessagesSquare,
  folder: FolderOpen,
  mail: Mail,
  chart: ChartColumn,
  history: History,
  layout: PanelTop,
  settings: Settings,
  flag: Flag,
  home: House,
  question: MessageCircleQuestion,
};
