import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QueueRow from "@/components/molecules/QueueRow";
import { axeViolations } from "./axe-helper";

describe("QueueRow", () => {
  it("wyłączony: aria-disabled=true", () => {
    render(<QueueRow title="Zgłoszenie #12" disabled />);

    const wiersz = screen.getByText("Zgłoszenie #12").closest("div[aria-disabled]");
    expect(wiersz).toHaveAttribute("aria-disabled", "true");
  });

  it("wyłączony: kliknięcie nie wywołuje żadnej akcji", async () => {
    const onClick = vi.fn();
    const uzytkownik = userEvent.setup();
    render(<QueueRow title="Zgłoszenie #12" disabled onClick={onClick} />);

    await uzytkownik.click(screen.getByText("Zgłoszenie #12"));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("z onClick: cały wiersz jest przyciskiem, kliknięcie wywołuje akcję", async () => {
    const onClick = vi.fn();
    const uzytkownik = userEvent.setup();
    render(<QueueRow title="Zgłoszenie #7" onClick={onClick} />);

    await uzytkownik.click(screen.getByRole("button", { name: /Zgłoszenie #7/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("z href: cały wiersz jest odnośnikiem", () => {
    render(<QueueRow title="Zgłoszenie #3" href="/panel/zgloszenia/3" />);

    expect(screen.getByRole("link", { name: /Zgłoszenie #3/ })).toHaveAttribute(
      "href",
      "/panel/zgloszenia/3",
    );
  });

  it("noga negatywna: bez href i onClick renderuje wiersz bez akcji (traktowany jak wyłączony)", () => {
    render(<QueueRow title="Zgłoszenie #9" />);

    const wiersz = screen.getByText("Zgłoszenie #9").closest("div[aria-disabled]");
    expect(wiersz).toHaveAttribute("aria-disabled", "true");
  });

  it("axe: 0 naruszeń", async () => {
    const { container } = render(<QueueRow title="Zgłoszenie #7" onClick={() => {}} />);

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
