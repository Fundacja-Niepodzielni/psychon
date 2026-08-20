"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { api, ApiError, setToken } from "@/lib/api";

interface LoginResponse {
  token: string;
  user: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    role:
      | "super_admin"
      | "project_manager"
      | "instructor"
      | "volunteer"
      | "student";
  };
}

/** Przekierowanie po zalogowaniu wg roli (słownik ról — kontrakt §3.4). */
const HOME_BY_ROLE: Record<LoginResponse["user"]["role"], string> = {
  volunteer: "/panel/start",
  student: "/panel/start",
  instructor: "/prowadzacy",
  project_manager: "/admin",
  super_admin: "/admin",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const { token, user } = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(token);
      router.push(HOME_BY_ROLE[user.role] ?? "/panel/start");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setFormError(
            "Zbyt wiele prób logowania. Odczekaj chwilę i spróbuj ponownie.",
          );
        } else if (err.status === 422 && err.errors) {
          setFieldErrors(err.errors);
          setFormError(err.message);
        } else if (err.status === 401 || err.status === 422) {
          setFormError("Nieprawidłowy e-mail lub hasło.");
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError(
          "Nie udało się połączyć z serwerem. Sprawdź, czy backend działa.",
        );
      }
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex size-12 items-center justify-center rounded-md bg-brand text-h3 font-black text-light"
          >
            N
          </span>
          <h1 className="mt-3 text-h2 font-black text-ink">Niepodzielni</h1>
          <p className="mt-1 text-small text-subtle">
            Platforma szkoleniowa — zaloguj się, aby kontynuować
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            {formError && <Alert variant="error">{formError}</Alert>}

            <Input
              label="Adres e-mail"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email?.[0]}
            />
            <Input
              label="Hasło"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password?.[0]}
            />

            <Button type="submit" loading={loading} className="mt-2 w-full">
              Zaloguj się
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-caption text-subtle">
          Problem z logowaniem? Skontaktuj się z opiekunem projektu.
        </p>
      </div>
    </div>
  );
}
