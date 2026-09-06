"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api";

function ActivationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Hasła muszą być identyczne.");
      return;
    }
    const token = params.get("token") ?? "";
    if (!token) {
      setError("Link aktywacyjny nie zawiera tokenu.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api<{ message: string }>("/auth/activate", { method: "POST", body: { token, password } });
      router.push("/logowanie?activated=1");
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.message : "Nie udało się aktywować konta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Ustaw hasło" className="w-full max-w-lg">
      <p className="mb-5 text-body text-muted">Ustaw hasło, aby aktywować konto w programie.</p>
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Input label="Hasło" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <Input label="Powtórz hasło" type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        <Button type="submit" loading={pending}>Aktywuj konto</Button>
      </form>
    </Card>
  );
}

export default function ActivationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page p-6">
      <Suspense fallback={<p className="text-body text-subtle">Wczytywanie…</p>}>
        <ActivationForm />
      </Suspense>
    </main>
  );
}
