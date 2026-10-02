/** Dane przykładowe karty osoby dla prób czynności administracji (bez sieci). */
export function kartaPrzykladowa(zmiany: { role?: string; workshopDone?: boolean; documents?: { id: number; type: string; number: string }[] } = {}) {
  return {
    profile: {
      id: 17,
      first_name: "Marta",
      last_name: "Demo",
      email: "marta@demo.pl",
      role: zmiany.role ?? "volunteer",
      phone: null,
      pesel: null,
      address: { street: "", city: "", zip: "" },
      access_expires_at: "2027-02-01T00:00:00Z",
      program_completed_at: null,
      product_group: "psychon",
    },
    progress: {
      courses_done: 1,
      courses_total: 10,
      hours_accepted: "0",
      supervision_present: 0,
      workshop_done: zmiany.workshopDone ?? true,
      path_tests_passed: 0,
      path_tests_total: 4,
    },
    documents: zmiany.documents ?? [],
    recent_notifications: [],
    audit_entries: [],
  };
}
