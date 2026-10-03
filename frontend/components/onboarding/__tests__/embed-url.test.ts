import { describe, expect, it } from "vitest";
import { toEmbedUrl } from "../embed-url";

describe("toEmbedUrl — odnośnik do filmu na ekranie „Zacznij tutaj”", () => {
  it("youtube.com i jego poddomeny przechodzą na odtwarzacz YouTube", () => {
    expect(toEmbedUrl("https://youtube.com/watch?v=abc")).toBe("https://www.youtube.com/embed/abc");
    expect(toEmbedUrl("https://www.youtube.com/watch?v=abc")).toBe("https://www.youtube.com/embed/abc");
    expect(toEmbedUrl("https://m.youtube.com/watch?v=abc")).toBe("https://www.youtube.com/embed/abc");
  });

  it("youtu.be przechodzi na odtwarzacz YouTube", () => {
    expect(toEmbedUrl("https://youtu.be/abc")).toBe("https://www.youtube.com/embed/abc");
  });

  it("host tylko kończący się na „youtube.com” nie jest YouTube", () => {
    expect(toEmbedUrl("https://evilyoutube.com/watch?v=x")).toBe("https://evilyoutube.com/watch?v=x");
    expect(toEmbedUrl("https://notyoutube.com/watch?v=x")).toBe("https://notyoutube.com/watch?v=x");
  });

  it("host z „youtube.com” w środku nie jest YouTube", () => {
    expect(toEmbedUrl("https://youtube.com.example.com/watch?v=x")).toBe("https://youtube.com.example.com/watch?v=x");
    expect(toEmbedUrl("https://example.com/youtube.com/watch?v=x")).toBe("https://example.com/youtube.com/watch?v=x");
  });

  it("adres YouTube bez parametru v oraz inne adresy zostają bez zmian", () => {
    expect(toEmbedUrl("https://www.youtube.com/embed/abc")).toBe("https://www.youtube.com/embed/abc");
    expect(toEmbedUrl("https://player.vimeo.com/video/1")).toBe("https://player.vimeo.com/video/1");
    expect(toEmbedUrl("nie adres")).toBe("nie adres");
  });
});
