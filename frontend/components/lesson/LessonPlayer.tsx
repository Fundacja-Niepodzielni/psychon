"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import VideoPlayer, {
  type HeartbeatPayload,
} from "@/components/VideoPlayer";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import { api, ApiError } from "@/lib/api";

export interface LessonData {
  id: number;
  title: string;
  description: string | null;
  duration_seconds: number;
  watched_seconds: number;
  active_seconds: number;
  is_completed: boolean;
  completable: boolean;
  completable_at_percent: number;
}

export interface LessonProgressData {
  watched_seconds: number;
  active_seconds: number;
  completable: boolean;
  completable_at_percent: number;
}

export interface LessonCompletionData {
  is_completed: boolean;
  completed_at: string;
}

export interface LessonPlayerProps {
  lessonId: number;
}

type ViewState =
  | "loading"
  | "load_error"
  | "ready"
  | "saving"
  | "save_error"
  | "completable"
  | "completing"
  | "completed";

type HeartbeatDelta = Pick<HeartbeatPayload, "watched_delta" | "active_delta">;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return fallback;
}

function progressFrom(
  lesson: LessonData,
  progress: LessonProgressData,
): LessonData {
  return {
    ...lesson,
    watched_seconds: progress.watched_seconds,
    active_seconds: progress.active_seconds,
    completable: progress.completable,
    completable_at_percent: progress.completable_at_percent,
  };
}

export default function LessonPlayer({ lessonId }: LessonPlayerProps) {
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loadedLessonId, setLoadedLessonId] = useState<number | null>(null);
  const [state, setState] = useState<ViewState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const queueRef = useRef<HeartbeatDelta[]>([]);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    void api<LessonData>("/lessons/" + lessonId)
      .then((data) => {
        if (!mountedRef.current) return;
        setLesson(data);
        setLoadedLessonId(lessonId);
        setMessage(null);
        setState(
          data.is_completed
            ? "completed"
            : data.completable
              ? "completable"
              : "ready",
        );
      })
      .catch((error: unknown) => {
        if (!mountedRef.current) return;
        setMessage(errorMessage(error, "Nie udało się pobrać lekcji."));
        setState("load_error");
      });

    return () => {
      mountedRef.current = false;
      queueRef.current = [];
    };
  }, [lessonId]);

  const sendNextHeartbeat = useCallback(async (): Promise<void> => {
    if (sendingRef.current || queueRef.current.length === 0 || lesson === null) {
      return;
    }

    sendingRef.current = true;
    try {
      while (mountedRef.current && queueRef.current.length > 0) {
        const next = queueRef.current.shift();
        if (!next) break;

        setMessage(null);
        setState("saving");

        try {
          const progress = await api<LessonProgressData>(
            "/lessons/" + lesson.id + "/progress",
            {
              method: "POST",
              body: {
                watched_delta: next.watched_delta,
                active_delta: next.active_delta,
              },
            },
          );

          if (!mountedRef.current) break;
          setLesson((current) =>
            current ? progressFrom(current, progress) : current,
          );
          setState(progress.completable ? "completable" : "ready");
        } catch (error: unknown) {
          queueRef.current.unshift(next);
          setMessage(errorMessage(error, "Nie udało się zapisać postępu."));
          setState("save_error");
          break;
        }
      }
    } finally {
      sendingRef.current = false;
    }
  }, [lesson]);

  const handleHeartbeat = useCallback(
    (payload: HeartbeatPayload) => {
      queueRef.current.push({
        watched_delta: payload.watched_delta,
        active_delta: payload.active_delta,
      });
      void sendNextHeartbeat();
    },
    [sendNextHeartbeat],
  );

  const retrySave = useCallback(() => {
    void sendNextHeartbeat();
  }, [sendNextHeartbeat]);

  const completeLesson = useCallback(async () => {
    if (lesson === null || !lesson.completable || lesson.is_completed) return;

    setMessage(null);
    setState("completing");

    try {
      const completion = await api<LessonCompletionData>(
        "/lessons/" + lesson.id + "/complete",
        { method: "POST" },
      );

      if (!mountedRef.current) return;
      setLesson((current) =>
        current
          ? { ...current, is_completed: completion.is_completed }
          : current,
      );
      setState("completed");
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      setMessage(errorMessage(error, "Nie udało się ukończyć lekcji."));
      setState(lesson.completable ? "completable" : "ready");
    }
  }, [lesson]);

  if (state === "load_error") {
    return (
      <Card title="Lekcja">
        <Alert variant="error" title="Nie udało się otworzyć lekcji">
          {message ?? "Spróbuj ponownie za chwilę."}
        </Alert>
      </Card>
    );
  }

  if (state === "loading" || loadedLessonId !== lessonId) {
    return (
      <Card title="Lekcja">
        <p className="text-body text-muted" role="status" aria-live="polite">
          Ładowanie lekcji…
        </p>
      </Card>
    );
  }

  if (lesson === null) {
    return (
      <Card title="Lekcja">
        <Alert variant="error" title="Nie udało się otworzyć lekcji">
          {message ?? "Spróbuj ponownie za chwilę."}
        </Alert>
      </Card>
    );
  }

  const watchedPercent =
    lesson.duration_seconds > 0
      ? (lesson.watched_seconds / lesson.duration_seconds) * 100
      : 0;

  return (
    <Card title={lesson.title}>
      {lesson.description && (
        <p className="mb-5 text-body text-muted">{lesson.description}</p>
      )}

      {state === "save_error" && (
        <Alert variant="error" title="Postęp nie został zapisany" className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{message ?? "Sprawdź połączenie i spróbuj ponownie."}</span>
            <Button variant="secondary" onClick={retrySave}>
              Spróbuj ponownie
            </Button>
          </div>
        </Alert>
      )}

      {state === "completed" && (
        <Alert variant="success" title="Lekcja ukończona" className="mb-5">
          Postęp został zapisany.
        </Alert>
      )}

      <VideoPlayer
        durationSeconds={lesson.duration_seconds}
        title={lesson.title}
        onHeartbeat={handleHeartbeat}
      />

      <div className="mt-5 space-y-3">
        <ProgressBar
          value={watchedPercent}
          label="Postęp oglądania lekcji"
          showValue
        />
        <p className="text-caption text-muted">
          Aktywny czas: {lesson.active_seconds} s. Do ukończenia potrzeba co
          najmniej {lesson.completable_at_percent}% aktywności.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        {state === "saving" && (
          <p className="text-small text-muted" role="status" aria-live="polite">
            Zapisywanie postępu…
          </p>
        )}

        {state === "completable" && (
          <Button onClick={completeLesson}>Ukończ lekcję</Button>
        )}

        {state === "completing" && (
          <Button loading>Ukończenie lekcji…</Button>
        )}

        {state === "ready" && (
          <p className="text-small text-muted" role="status" aria-live="polite">
            Odtwarzanie w toku. Ukończenie będzie dostępne po osiągnięciu progu.
          </p>
        )}
      </div>
    </Card>
  );
}
