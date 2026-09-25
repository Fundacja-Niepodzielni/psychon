"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/molecules/ErrorState";
import ForbiddenState from "@/components/molecules/ForbiddenState";
import LoadingState from "@/components/molecules/LoadingState";
import PageTemplate from "@/components/templates/PageTemplate";
import { ApiError } from "@/lib/api";
import {
  addThreadMember,
  createInstructorGroupThread,
  fetchInstructorGroupThreads,
  fetchThreadMessages,
  formatThreadDate,
  removeThreadMember,
  sendThreadMessage,
  type ChatMessage,
  type ChatThread,
} from "@/lib/chat";

/**
 * Wątek grupowy prowadzącego („prowadzący prowadzi wątek
 * grupowy"). Lista wątków grupowych widocznych prowadzącemu (w praktyce
 * jeden — własna grupa) i po otwarciu: lista wiadomości oraz pole wysyłki.
 */
export default function InstructorGroupThread() {
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadForbidden, setLoadForbidden] = useState(false);
  const [reloadThreads, setReloadThreads] = useState(0);

  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesForbidden, setMessagesForbidden] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [creatingThread, setCreatingThread] = useState(false);
  const [createThreadError, setCreateThreadError] = useState<string | null>(null);

  const [memberIdInput, setMemberIdInput] = useState("");
  const [memberActionPending, setMemberActionPending] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberActionMessage, setMemberActionMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchInstructorGroupThreads()
      .then((data) => {
        if (cancelled) return;
        setThreads(data);
        setLoadError(null);
        setLoadForbidden(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 403) {
          setLoadForbidden(true);
          setLoadError(null);
        } else {
          setLoadForbidden(false);
          setLoadError(
            error instanceof ApiError
              ? error.message
              : "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
          );
        }
        setThreads([]);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadThreads]);

  function openThread(threadId: number) {
    setSelectedThreadId(threadId);
    setMessages(null);
    setMessagesError(null);
    setMessagesForbidden(false);
    setMessagesLoading(true);
    setSendError(null);

    fetchThreadMessages(threadId)
      .then(({ data }) => {
        setMessages(data);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403) {
          setMessagesForbidden(true);
        } else {
          setMessagesError(
            error instanceof ApiError
              ? error.message
              : "Nie udało się wczytać wiadomości. Spróbuj ponownie.",
          );
        }
      })
      .finally(() => setMessagesLoading(false));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (selectedThreadId === null) return;

    setSending(true);
    setSendError(null);

    sendThreadMessage(selectedThreadId, draft)
      .then((message) => {
        setMessages((current) => (current ? [...current, message] : [message]));
        setDraft("");
      })
      .catch((error: unknown) => {
        setSendError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się wysłać wiadomości. Spróbuj ponownie.",
        );
      })
      .finally(() => setSending(false));
  }

  function createThread() {
    setCreatingThread(true);
    setCreateThreadError(null);

    createInstructorGroupThread()
      .then(() => {
        setThreads(null);
        setReloadThreads((value) => value + 1);
      })
      .catch((error: unknown) => {
        setCreateThreadError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się założyć wątku grupowego. Spróbuj ponownie.",
        );
      })
      .finally(() => setCreatingThread(false));
  }

  function parseMemberId(): number | null {
    const value = Number(memberIdInput);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  function addMember(event: FormEvent) {
    event.preventDefault();
    if (selectedThreadId === null) return;

    const userId = parseMemberId();
    if (userId === null) return;

    setMemberActionPending(true);
    setMemberActionError(null);
    setMemberActionMessage(null);

    addThreadMember(selectedThreadId, userId)
      .then(() => {
        setMemberActionMessage("Osoba dodana do składu wątku.");
        setMemberIdInput("");
      })
      .catch((error: unknown) => {
        setMemberActionError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się dodać osoby do wątku. Spróbuj ponownie.",
        );
      })
      .finally(() => setMemberActionPending(false));
  }

  function removeMember() {
    if (selectedThreadId === null) return;

    const userId = parseMemberId();
    if (userId === null) return;

    setMemberActionPending(true);
    setMemberActionError(null);
    setMemberActionMessage(null);

    removeThreadMember(selectedThreadId, userId)
      .then(() => {
        setMemberActionMessage("Osoba usunięta ze składu wątku.");
        setMemberIdInput("");
      })
      .catch((error: unknown) => {
        setMemberActionError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się usunąć osoby z wątku. Spróbuj ponownie.",
        );
      })
      .finally(() => setMemberActionPending(false));
  }

  const loadingThreads = threads === null;

  return (
    <PageTemplate naglowek={{ title: "Wątek grupowy" }}>
      {loadingThreads && <LoadingState label="Wczytuję wątek grupowy…" />}

      {!loadingThreads && loadForbidden && (
        <ForbiddenState message="Nie masz uprawnień do wyświetlenia wątku grupowego." />
      )}

      {!loadingThreads && !loadForbidden && loadError && (
        <ErrorState
          message={loadError}
          title="Nie udało się wczytać wątku grupowego"
          onRetry={() => {
            setThreads(null);
            setReloadThreads((value) => value + 1);
          }}
        />
      )}

      {!loadingThreads &&
        !loadForbidden &&
        !loadError &&
        threads !== null &&
        threads.length === 0 && (
          <Card className="flex flex-col gap-3">
            <p className="text-body text-muted">
              Nie masz jeszcze wątku grupowego.
            </p>
            {createThreadError && <Alert variant="error">{createThreadError}</Alert>}
            <Button
              variant="primary"
              className="self-start"
              loading={creatingThread}
              onClick={createThread}
            >
              Załóż wątek grupowy
            </Button>
          </Card>
        )}

      {!loadingThreads && !loadForbidden && !loadError && threads !== null && threads.length > 0 && (
        <div className="flex flex-col gap-3">
          {threads.map((thread) => (
            <Card key={thread.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Badge variant="info">Grupa</Badge>
                <p className="text-caption text-subtle">
                  {thread.updated_at
                    ? `Ostatnia wiadomość: ${formatThreadDate(thread.updated_at)}`
                    : "Brak wiadomości"}
                </p>
              </div>
              <Button
                variant={selectedThreadId === thread.id ? "secondary" : "primary"}
                onClick={() => openThread(thread.id)}
              >
                Otwórz wątek
              </Button>
            </Card>
          ))}
        </div>
      )}

      {selectedThreadId !== null && (
        <Card title="Wiadomości">
          {messagesLoading && <LoadingState label="Wczytuję wiadomości…" />}

          {!messagesLoading && messagesForbidden && (
            <ForbiddenState message="Nie masz uprawnień do wyświetlenia tego wątku." />
          )}

          {!messagesLoading && !messagesForbidden && messagesError && (
            <ErrorState
              message={messagesError}
              title="Nie udało się wczytać wiadomości"
              onRetry={() => openThread(selectedThreadId)}
            />
          )}

          {!messagesLoading && !messagesForbidden && !messagesError && messages !== null && (
            <div className="flex flex-col gap-4">
              {messages.length === 0 ? (
                <p className="text-body text-muted">
                  Nie ma jeszcze żadnych wiadomości w tym wątku.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {messages.map((message) => (
                    <li
                      key={message.id}
                      className="flex flex-col gap-1 rounded-md bg-grey px-3 py-2"
                    >
                      <p className="text-caption text-subtle">
                        {message.sender
                          ? `${message.sender.first_name} ${message.sender.last_name}`
                          : "Nieznany nadawca"}
                        {message.created_at
                          ? ` · ${formatThreadDate(message.created_at)}`
                          : ""}
                      </p>
                      {/* Treść jako tekst — nigdy dangerouslySetInnerHTML. */}
                      <p className="whitespace-pre-wrap text-body text-ink">
                        {message.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <form className="flex flex-col gap-2" onSubmit={submit}>
                <label
                  className="text-caption font-bold tracking-wide text-subtle"
                  htmlFor="grupa-watek-wiadomosc"
                >
                  Wiadomość do grupy
                </label>
                <textarea
                  id="grupa-watek-wiadomosc"
                  className="min-h-24 rounded-md border border-line bg-card px-3 py-2 text-body text-ink focus-visible:focus-ring"
                  value={draft}
                  maxLength={5000}
                  required
                  onChange={(event) => setDraft(event.target.value)}
                />
                {sendError && <Alert variant="error">{sendError}</Alert>}
                <Button type="submit" loading={sending} className="self-start">
                  Wyślij wiadomość
                </Button>
              </form>
            </div>
          )}
        </Card>
      )}

      {selectedThreadId !== null &&
        !messagesLoading &&
        !messagesForbidden &&
        !messagesError && (
          <Card title="Skład wątku">
            <form className="flex flex-col gap-2" onSubmit={addMember}>
              <label
                className="text-caption font-bold tracking-wide text-subtle"
                htmlFor="grupa-watek-osoba-id"
              >
                Identyfikator osoby
              </label>
              <input
                id="grupa-watek-osoba-id"
                type="number"
                min={1}
                className="min-h-control w-full max-w-xs rounded-control border border-control bg-card px-4 py-2 text-body text-ink focus-visible:focus-ring"
                value={memberIdInput}
                onChange={(event) => setMemberIdInput(event.target.value)}
              />
              {memberActionError && <Alert variant="error">{memberActionError}</Alert>}
              {memberActionMessage && <Alert variant="success">{memberActionMessage}</Alert>}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  loading={memberActionPending}
                  disabled={parseMemberId() === null}
                >
                  Dodaj do wątku
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={memberActionPending}
                  disabled={parseMemberId() === null}
                  onClick={removeMember}
                >
                  Usuń z wątku
                </Button>
              </div>
            </form>
          </Card>
        )}
    </PageTemplate>
  );
}
