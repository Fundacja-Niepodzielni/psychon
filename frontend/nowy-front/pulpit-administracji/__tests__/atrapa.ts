/** Odpowiedź `GET /admin/dashboard` — klucze jak w schemacie `backend/openapi.json`. */
export function odpowiedzPulpitu(nadpisz: Partial<Record<string, unknown>> = {}) {
  return {
    counters: { participants: 12, completed: 3, certificates: 2 },
    queues: [
      { key: "applications", count: 4, link: "/admin/uczestniczki?zakladka=zgloszenia" },
      { key: "internship_entries", count: 7, link: "/admin/staz" },
      { key: "profiles", count: 0, link: "/admin/profile" },
      { key: "questions", count: 7, link: "/prowadzacy/pytania" },
    ],
    ...nadpisz,
  };
}
