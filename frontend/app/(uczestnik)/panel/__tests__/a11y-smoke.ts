import { expect } from "vitest";

/**
 * Accessibility smoke check shared by the participant screen suites.
 *
 * Plain DOM assertions, no extra dependency: every visible form control must
 * have a programmatic label (`<label>`, `aria-label` or `aria-labelledby`),
 * every `<img>` must carry an `alt` attribute, and every `role="img"` node
 * must have an accessible name. Returns the number of controls checked so a
 * caller can prove the check actually ran over something.
 */
export function expectLabelledControlsAndImages(root: HTMLElement): number {
  const controls = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input:not([type=hidden]), select, textarea",
    ),
  );
  const unlabelled = controls.filter(
    (control) =>
      (control.labels?.length ?? 0) === 0 &&
      !control.getAttribute("aria-label")?.trim() &&
      !control.getAttribute("aria-labelledby")?.trim(),
  );
  expect(unlabelled.map((control) => control.outerHTML)).toEqual([]);

  const imagesWithoutAlt = Array.from(root.querySelectorAll("img")).filter(
    (img) => !img.hasAttribute("alt"),
  );
  expect(imagesWithoutAlt.map((img) => img.outerHTML)).toEqual([]);

  const unnamedRoleImages = Array.from(root.querySelectorAll('[role="img"]')).filter(
    (node) =>
      !node.getAttribute("aria-label")?.trim() && !node.getAttribute("aria-labelledby")?.trim(),
  );
  expect(unnamedRoleImages.map((node) => node.outerHTML)).toEqual([]);

  return controls.length;
}
