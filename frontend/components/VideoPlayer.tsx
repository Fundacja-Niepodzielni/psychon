"use client";

import { useEffect, useRef, useState } from "react";

export interface HeartbeatPayload {
  /** Bieżąca pozycja odtwarzania (s). */
  position_seconds: number;
  /** Ile sekund materiału obejrzano od poprzedniego heartbeatu. */
  watched_delta: number;
  /** Ile z tych sekund przy widocznej karcie (Page Visibility API). */
  active_delta: number;
}

export interface VideoPlayerProps {
  durationSeconds: number;
  initialPositionSeconds?: number;
  /**
   * Wołane co 10 s WYŁĄCZNIE gdy odtwarzacz gra i karta jest widoczna
   * (kształt zgodny z POST /lessons/{id}/progress — kontrakt §2).
   */
  onHeartbeat?: (payload: HeartbeatPayload) => void;
  onEnded?: () => void;
  /** Tytuł materiału (dla czytników ekranu). */
  title?: string;
}

const HEARTBEAT_INTERVAL_S = 10;

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

/**
 * Atrapa odtwarzacza wideo (starter — bez prawdziwego Bunny Stream).
 * Symuluje odtwarzanie zegarem 1 s; liczy przyrosty watched/active
 * i emituje heartbeat co 10 s, tylko gdy gra i karta jest widoczna.
 */
export default function VideoPlayer({
  durationSeconds,
  initialPositionSeconds = 0,
  onHeartbeat,
  onEnded,
  title = "Materiał wideo",
}: VideoPlayerProps) {
  const [position, setPosition] = useState(
    Math.min(initialPositionSeconds, durationSeconds),
  );
  const [playing, setPlaying] = useState(false);

  // Refy — aktualne wartości dla zegara bez restartu interwału.
  const positionRef = useRef(position);
  const playingRef = useRef(playing);
  const watchedDeltaRef = useRef(0);
  const activeDeltaRef = useRef(0);
  const sinceHeartbeatRef = useRef(0);
  const onHeartbeatRef = useRef(onHeartbeat);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    onHeartbeatRef.current = onHeartbeat;
    onEndedRef.current = onEnded;
  }, [onHeartbeat, onEnded]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (!playingRef.current) return;

      const next = Math.min(positionRef.current + 1, durationSeconds);
      const advanced = next - positionRef.current;
      setPosition(next);

      if (advanced > 0) {
        watchedDeltaRef.current += advanced;
        if (document.visibilityState === "visible") {
          activeDeltaRef.current += advanced;
        }
      }

      // Koniec materiału
      if (next >= durationSeconds) {
        setPlaying(false);
        flushHeartbeat(next);
        onEndedRef.current?.();
        return;
      }

      // Heartbeat co 10 s — tylko gdy gra i karta widoczna
      sinceHeartbeatRef.current += 1;
      if (sinceHeartbeatRef.current >= HEARTBEAT_INTERVAL_S) {
        if (document.visibilityState === "visible") {
          flushHeartbeat(next);
        }
        sinceHeartbeatRef.current = 0;
      }
    }, 1000);

    function flushHeartbeat(currentPosition: number) {
      if (watchedDeltaRef.current === 0 && activeDeltaRef.current === 0) return;
      onHeartbeatRef.current?.({
        position_seconds: currentPosition,
        watched_delta: watchedDeltaRef.current,
        active_delta: activeDeltaRef.current,
      });
      watchedDeltaRef.current = 0;
      activeDeltaRef.current = 0;
    }

    return () => window.clearInterval(tick);
  }, [durationSeconds]);

  function handleSeek(value: number) {
    // Przewinięcie nie nabija watched/active — to tylko zmiana pozycji.
    setPosition(Math.max(0, Math.min(value, durationSeconds)));
  }

  const progressPercent =
    durationSeconds > 0 ? (position / durationSeconds) * 100 : 0;
  const ended = position >= durationSeconds;

  return (
    <div
      className="overflow-hidden rounded-lg border border-line bg-card shadow-card"
      aria-label={title}
    >
      {/* „Ekran" atrapy */}
      <div className="flex aspect-video items-center justify-center bg-ink">
        <p className="px-6 text-center text-small text-light/70">
          Atrapa odtwarzacza — prawdziwe wideo (Bunny Stream) po hackathonie
        </p>
      </div>

      {/* Pasek postępu (wizualny) */}
      <div className="h-1.5 bg-grey-mid" aria-hidden="true">
        <div
          className="h-full bg-brand transition-[width] duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Sterowanie */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            if (ended) {
              setPosition(0);
              setPlaying(true);
            } else {
              setPlaying((p) => !p);
            }
          }}
          aria-label={
            ended ? "Odtwórz od początku" : playing ? "Pauza" : "Odtwórz"
          }
          className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-primary text-light transition-colors duration-200 hover:bg-ink focus-visible:focus-ring"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
              <rect x="5" y="4" width="5" height="16" rx="1" />
              <rect x="14" y="4" width="5" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l13-7.5a1 1 0 0 0 0-1.72l-13-7.5A1 1 0 0 0 7 4.5Z" />
            </svg>
          )}
        </button>

        <label className="flex min-w-40 flex-1 items-center gap-2">
          <span className="sr-only">Przewiń materiał</span>
          <input
            type="range"
            min={0}
            max={durationSeconds}
            step={1}
            value={position}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="w-full accent-brand focus-visible:focus-ring"
          />
        </label>

        <p className="shrink-0 text-caption font-medium tabular-nums text-muted">
          <span aria-label="Pozycja">{formatTime(position)}</span>
          {" / "}
          <span aria-label="Czas trwania">{formatTime(durationSeconds)}</span>
        </p>
      </div>
    </div>
  );
}
