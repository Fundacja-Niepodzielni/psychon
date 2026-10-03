/** Czy host to `youtube.com` albo jego poddomena (porównanie hosta dokładne, nie po końcówce napisu). */
function jestHostemYoutube(host: string): boolean {
  return host === "youtube.com" || host.endsWith(".youtube.com");
}

/** Zamienia typowy link do YouTube/Vimeo na adres do osadzenia w <iframe>. */
export function toEmbedUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
    }
    if (jestHostemYoutube(url.hostname) && url.searchParams.has("v")) {
      return `https://www.youtube.com/embed/${url.searchParams.get("v")}`;
    }
    return raw;
  } catch {
    return raw;
  }
}
