import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListTemplate from "@/components/templates/ListTemplate";

describe("ListTemplate", () => {
  it("stan success: pokazuje nagłówek i treść listy, bez stanów pomocniczych", () => {
    render(
      <ListTemplate naglowek={{ title: "Kursy" }} stan="success">
        <p>Tabela kursów</p>
      </ListTemplate>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Kursy" })).toBeInTheDocument();
    expect(screen.getByText("Tabela kursów")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stan loading: pokazuje LoadingState zamiast treści", () => {
    render(
      <ListTemplate naglowek={{ title: "Kursy" }} stan="loading">
        <p>Tabela kursów</p>
      </ListTemplate>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Tabela kursów")).not.toBeInTheDocument();
  });

  it("stan error: pokazuje ErrorState i wywołuje ponowienie", async () => {
    const onPonow = vi.fn();
    render(
      <ListTemplate
        naglowek={{ title: "Kursy" }}
        stan="error"
        komunikatBledu="Serwer nie odpowiada."
        onPonow={onPonow}
      >
        <p>Tabela kursów</p>
      </ListTemplate>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");
    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(onPonow).toHaveBeenCalledTimes(1);
  });

  it("httpStatus=403 na stanie error: mapuje na odmowę zamiast ErrorState", () => {
    render(
      <ListTemplate naglowek={{ title: "Kursy" }} stan="error" httpStatus={403}>
        <p>Tabela kursów</p>
      </ListTemplate>,
    );

    expect(screen.getByText("Brak dostępu")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("httpStatus=500 na stanie error: zostaje ErrorState, nie odmowa", () => {
    render(
      <ListTemplate naglowek={{ title: "Kursy" }} stan="error" httpStatus={500}>
        <p>Tabela kursów</p>
      </ListTemplate>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });

  it("komunikatLadowania/komunikatBleduTytul: przechodzą do molekuł, puste komunikatBleduTytul chowa tytuł", () => {
    const { rerender } = render(
      <ListTemplate naglowek={{ title: "Kursy" }} stan="loading" komunikatLadowania="Ładowanie kursów…">
        <p>Tabela kursów</p>
      </ListTemplate>,
    );
    expect(screen.getByRole("status")).toHaveAccessibleName("Ładowanie kursów…");

    rerender(
      <ListTemplate
        naglowek={{ title: "Kursy" }}
        stan="error"
        komunikatBledu="Awaria."
        komunikatBleduTytul=""
      >
        <p>Tabela kursów</p>
      </ListTemplate>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Awaria.");
    expect(screen.queryByText("Nie udało się wczytać danych")).not.toBeInTheDocument();
  });

  it("stan forbidden: pokazuje odmowę bez treści listy", () => {
    render(
      <ListTemplate naglowek={{ title: "Kursy" }} stan="forbidden">
        <p>Tabela kursów</p>
      </ListTemplate>,
    );

    expect(screen.getByText("Brak dostępu")).toBeInTheDocument();
    expect(screen.queryByText("Tabela kursów")).not.toBeInTheDocument();
  });

  it("stan empty: pokazuje EmptyState z podanym tytułem", () => {
    render(
      <ListTemplate naglowek={{ title: "Kursy" }} stan="empty" pustyTytul="Nie masz jeszcze kursów">
        <p>Tabela kursów</p>
      </ListTemplate>,
    );

    expect(screen.getByRole("heading", { name: "Nie masz jeszcze kursów" })).toBeInTheDocument();
  });

  it("noga negatywna: bez paginacji albo z jedną stroną nie pokazuje kontrolek stronicowania", () => {
    render(
      <ListTemplate
        naglowek={{ title: "Kursy" }}
        stan="success"
        paginacja={{ strona: 1, ostatniaStrona: 1, onZmien: vi.fn() }}
      >
        <p>Tabela kursów</p>
      </ListTemplate>,
    );

    expect(screen.queryByRole("button", { name: "Poprzednia" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Następna" })).not.toBeInTheDocument();
  });

  it("stronicowanie: klika Następna i woła onZmien z kolejną stroną", async () => {
    const onZmien = vi.fn();
    render(
      <ListTemplate
        naglowek={{ title: "Kursy" }}
        stan="success"
        paginacja={{ strona: 1, ostatniaStrona: 3, onZmien }}
      >
        <p>Tabela kursów</p>
      </ListTemplate>,
    );

    expect(screen.getByRole("button", { name: "Poprzednia" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Następna" }));
    expect(onZmien).toHaveBeenCalledWith(2);
  });
});
