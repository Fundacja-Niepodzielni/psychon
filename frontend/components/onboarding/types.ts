/**
 * Kształt treści ekranu „Zacznij tutaj" (H21) — współdzielony przez podgląd
 * uczestnika (`OnboardingView`) i edytor administracji (`OnboardingEditor`).
 * Zgodny z odpowiedzią `GET /onboarding` / `PATCH /admin/onboarding`
 * (`docs/hackathon/02-kontrakt-api.md`).
 */
export interface VideoSection {
  title: string;
  url: string | null;
  caption: string | null;
}

export interface TextSection {
  title: string;
  body: string;
}

export interface Onboarding {
  video: VideoSection;
  program: TextSection;
  expectations: TextSection;
  updated_at: string | null;
}
