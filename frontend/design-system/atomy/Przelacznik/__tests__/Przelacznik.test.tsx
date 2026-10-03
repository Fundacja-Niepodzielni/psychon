import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Przelacznik } from "../Przelacznik";

describe("Przelacznik", () => {
  it("ma rolę switch z aria-checked zgodnym ze stanem", () => {
    const { rerender } = render(
      <Przelacznik id="p" wlaczony={false} onZmiana={() => {}} etykieta="Powiadomienia" />,
    );
    expect(screen.getByRole("switch", { name: "Powiadomienia" })).toHaveAttribute("aria-checked", "false");
    rerender(<Przelacznik id="p" wlaczony onZmiana={() => {}} etykieta="Powiadomienia" />);
    expect(screen.getByRole("switch", { name: "Powiadomienia" })).toHaveAttribute("aria-checked", "true");
  });

  it("klik w kontrolkę i klik w etykietę przełączają stan", async () => {
    const naZmiana = vi.fn();
    render(<Przelacznik id="p" wlaczony={false} onZmiana={naZmiana} etykieta="Powiadomienia" />);
    await userEvent.click(screen.getByRole("switch"));
    expect(naZmiana).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByText("Powiadomienia"));
    expect(naZmiana).toHaveBeenCalledTimes(2);
  });

  it("działa z klawiatury: Spacja i Enter", async () => {
    const naZmiana = vi.fn();
    render(<Przelacznik id="p" wlaczony onZmiana={naZmiana} etykieta="Powiadomienia" />);
    await userEvent.tab();
    expect(screen.getByRole("switch")).toHaveFocus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{Enter}");
    expect(naZmiana).toHaveBeenCalledTimes(2);
    expect(naZmiana).toHaveBeenLastCalledWith(false);
  });

  it("opis jest podpięty jako aria-describedby", () => {
    render(<Przelacznik id="p" wlaczony onZmiana={() => {}} etykieta="A" opis="Dostaje osoba." />);
    expect(screen.getByRole("switch")).toHaveAccessibleDescription("Dostaje osoba.");
  });

  it("zaznaczenie ma widoczny znacznik, nie tylko tło", () => {
    const { rerender } = render(<Przelacznik id="p" wlaczony onZmiana={() => {}} etykieta="A" />);
    expect(screen.getByText("✓")).toBeInTheDocument();
    rerender(<Przelacznik id="p" wlaczony={false} onZmiana={() => {}} etykieta="A" />);
    expect(screen.queryByText("✓")).not.toBeInTheDocument();
  });

  it("zablokowany nie reaguje na klik i wypada z kolejności Tab", async () => {
    const naZmiana = vi.fn();
    render(<Przelacznik id="p" wlaczony onZmiana={naZmiana} etykieta="A" zablokowany />);
    const przelacznik = screen.getByRole("switch");
    expect(przelacznik).toBeDisabled();
    await userEvent.click(przelacznik);
    expect(naZmiana).not.toHaveBeenCalled();
  });
});
