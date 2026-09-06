import type { Metadata } from "next";
import PsychologistProfileForm from "@/components/h15/PsychologistProfileForm";

export const metadata: Metadata = { title: "Profil psychologa — Niepodzielni" };

export default function PsychologistProfilePage() {
  return <PsychologistProfileForm />;
}
