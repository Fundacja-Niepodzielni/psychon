import type { MenuEntry } from "../types";

/** Pakiet H13 — certyfikat ukończenia programu. */
const entry: MenuEntry = {
  label: "Certyfikat",
  href: "/panel/certyfikat",
  order: 80,
  icon: "award",
  section: "program",
  roles: ["volunteer"],
};

export default entry;
