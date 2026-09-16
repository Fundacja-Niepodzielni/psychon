"use client";

import Link from "next/link";
import { useCallback } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ListTemplate from "@/components/templates/ListTemplate";
import { useZasobStronicowany } from "@/lib/hooks/useZasobStronicowany";
import { apiPaged } from "@/lib/api";
import type { AdminPsychologistProfile } from "@/lib/h15/types";

/**
 * Kolejka wniosków o profil psychologa, na `ListTemplate` (jeden mechanizm
 * stanów listy zamiast osobnej kopii ładowania/błędu/pustki na tym ekranie).
 */
export default function AdminProfileQueue() {
  const pobierz = useCallback(
    (strona: number) =>
      apiPaged<AdminPsychologistProfile>(`/admin/profiles?page=${strona}&per_page=25`),
    [],
  );

  const { stan, meta, strona, ustawStrone, ponow } = useZasobStronicowany<AdminPsychologistProfile>(
    pobierz,
    [],
    "Nie udało się wczytać kolejki.",
  );

  const profiles = stan.status === "success" ? stan.data : [];
  const listaPusta = stan.status === "success" && profiles.length === 0;

  return (
    <ListTemplate
      naglowek={{
        title: "Profile psychologów",
        description: "Wnioski oczekujące na weryfikację.",
      }}
      stan={listaPusta ? "empty" : stan.status}
      httpStatus={stan.status === "error" ? stan.httpStatus : undefined}
      komunikatLadowania="Wczytywanie kolejki…"
      komunikatBledu={stan.status === "error" ? stan.message : undefined}
      komunikatBleduTytul=""
      onPonow={ponow}
      pustyTytul="Brak wniosków oczekujących na decyzję."
      pustyOpis="Nowe wnioski pojawią się tutaj, gdy psycholożki i psychologowie je złożą."
      paginacja={
        meta ? { strona, ostatniaStrona: meta.last_page, onZmien: ustawStrone } : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {profiles.map((profile) => (
          <Card key={profile.id} title={`${profile.user.first_name} ${profile.user.last_name}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-small text-muted">
                  {profile.city ?? "—"} · {profile.approach ?? "—"}
                </p>
                <p className="text-small text-muted">
                  Załączniki: {profile.documents.length}
                </p>
              </div>
              <Badge variant="info">Oczekuje na weryfikację</Badge>
            </div>
            <div className="mt-4">
              <Link href={`/admin/profile/${profile.id}`}>
                <Button variant="secondary">Zobacz szczegóły</Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </ListTemplate>
  );
}
