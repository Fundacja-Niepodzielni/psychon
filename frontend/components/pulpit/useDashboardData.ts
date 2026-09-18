import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  fetchCourse,
  fetchCourses,
  type CourseDetail,
  type CourseListItem,
} from "@/lib/courses";
import type { ParticipantSlot } from "@/lib/h12/types";
import {
  fetchCertificateConditions,
  fetchPulpitMe,
  fetchSupervisionSlots,
  pathStages,
  resolveNextStep,
  type CertificateConditions,
  type NextStep,
  type PulpitMe,
} from "@/lib/pulpit/data";

/** Stan zapytania pomocniczego: ładowanie, sukces lub rzeczowa nota o awarii. */
export type Aux<T> = { status: "loading" } | { status: "error" } | { status: "ok"; data: T };

/**
 * Pobiera i scala wszystkie dane pulpitu uczestnika. Wydzielone z
 * `PulpitDashboard`, żeby komponent kompozycji zostawał czystą prezentacją.
 * Logika i kolejność wywołań identyczna jak w oryginale (Z-7: superwizja
 * i warunki certyfikatu tylko dla roli `volunteer`).
 */
export function useDashboardData() {
  const [me, setMe] = useState<PulpitMe | null>(null);
  const [courses, setCourses] = useState<CourseListItem[] | null>(null);
  const [basicsError, setBasicsError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [slots, setSlots] = useState<
    Aux<ParticipantSlot[]> | { status: "skipped" }
  >({ status: "loading" });
  const [detail, setDetail] = useState<Aux<CourseDetail> | null>(null);
  const [conditions, setConditions] = useState<
    Aux<CertificateConditions> | { status: "skipped" }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;

    Promise.all([fetchPulpitMe(), fetchCourses()])
      .then(([loadedMe, loadedCourses]) => {
        if (!active) return;
        setMe(loadedMe);
        setCourses(loadedCourses);

        // Superwizja przysługuje wyłącznie wolontariuszkom, więc studentce
        // nie pokazujemy węzła i nie pytamy o niego serwera: żądanie i tak
        // wróciłoby odmową, a sekcja wyglądałaby jak zepsuta (Z-7).
        if (loadedMe.role === "volunteer") {
          fetchSupervisionSlots()
            .then((data) => active && setSlots({ status: "ok", data }))
            .catch(() => active && setSlots({ status: "error" }));
        } else {
          setSlots({ status: "skipped" });
        }

        const inProgress = pathStages(loadedCourses).find(
          (course) => course.status === "in_progress",
        );
        if (inProgress) {
          setDetail({ status: "loading" });
          fetchCourse(inProgress.slug)
            .then((data) => active && setDetail({ status: "ok", data }))
            .catch(() => active && setDetail({ status: "error" }));
        }

        if (loadedMe.role === "volunteer") {
          fetchCertificateConditions()
            .then((data) => active && setConditions({ status: "ok", data }))
            .catch(() => active && setConditions({ status: "error" }));
        } else {
          setConditions({ status: "skipped" });
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setBasicsError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
        );
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setMe(null);
    setCourses(null);
    setBasicsError(null);
    setSlots({ status: "loading" });
    setDetail(null);
    setConditions({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const stages = useMemo(() => (courses ? pathStages(courses) : []), [courses]);
  const inProgress = useMemo(
    () => stages.find((course) => course.status === "in_progress") ?? null,
    [stages],
  );

  const nextStep = useMemo<NextStep | null>(() => {
    if (!courses) return null;
    if (inProgress) {
      if (!detail || detail.status === "loading") return null;
      if (detail.status === "error") return null;
      return resolveNextStep(courses, detail.data);
    }
    return resolveNextStep(courses, null);
  }, [courses, inProgress, detail]);

  return {
    me,
    courses,
    basicsError,
    retry,
    slots,
    conditions,
    stages,
    inProgress,
    detail,
    nextStep,
  };
}
