import Link from "next/link";
import type { ReactNode } from "react";
import type { ParticipantSlot } from "@/lib/h12/types";
import { fullDateTime, nextFutureSlot, relativeTimeTo } from "@/lib/pulpit/data";
import { CalendarIcon } from "./icons";
import { NODE_TONE, NodeShell } from "./NodeShell";
import { LINK_CLASS } from "./styles";
import type { Aux } from "./useDashboardData";

/** Węzeł mapy rozwoju: odliczanie do pierwszej superwizji (tylko wolontariuszki). */
export default function SupervisionNode({ slots }: { slots: Aux<ParticipantSlot[]> }) {
  const link = (
    <Link href="/panel/superwizja" className={LINK_CLASS}>
      Zobacz superwizje
      <span aria-hidden="true">→</span>
    </Link>
  );

  let body: ReactNode;
  if (slots.status === "loading") {
    body = (
      <p role="status" className="text-small text-muted">
        Wczytywanie terminów superwizji…
      </p>
    );
  } else if (slots.status === "error") {
    body = (
      <>
        <p className="text-small text-muted">
          Nie udało się wczytać terminów superwizji.
        </p>
        {link}
      </>
    );
  } else {
    const slot = nextFutureSlot(slots.data);
    body = slot ? (
      <>
        <p className="text-body font-medium text-ink">
          {relativeTimeTo(slot.starts_at)}
        </p>
        <p className="text-small text-muted">{fullDateTime(slot.starts_at)}</p>
        {link}
      </>
    ) : (
      <>
        <p className="text-small text-muted">
          Termin pierwszej superwizji pojawi się tutaj, gdy opiekun go zaplanuje.
        </p>
        {link}
      </>
    );
  }

  return (
    <NodeShell tone={NODE_TONE.supervision} icon={<CalendarIcon />} showConnector={false}>
      <p className="text-caption font-bold tracking-wide text-subtle">Superwizja 1:1</p>
      <h3 className="text-h4 font-bold text-ink">Pierwsze spotkanie z superwizorem</h3>
      {body}
    </NodeShell>
  );
}
