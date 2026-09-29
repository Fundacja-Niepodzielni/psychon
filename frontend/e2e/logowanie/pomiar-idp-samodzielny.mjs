#!/usr/bin/env node
// Pomiar SAMEGO dostawcy tozsamosci efemerycznego, NIEZALEZNY od frontu
// Next.js/zaplecza Laravel (ktorych ten bieg nie stawia - ten zakres, "front ->
// zaplecze" w calosci, zostaje osobnym krokiem, nieukonczonym tutaj).
//
// Ten skrypt dowodzi trzech rzeczy o SAMYM IdP, prawdziwa przegladarka
// (Playwright, ta sama zaleznosc co frontend/e2e), prawdziwym przeplywem
// authorization code + PKCE, bez direct grantu (ktory w tym realmie jest
// wylaczony, tak jak w kontrakcie SS2c.3):
//   1. token z realm_access.roles zgodnym z uzytkownikiem/rola (strona IdP,
//      NIE cala noga "front->zaplecze"),
//   2. wygasniecie tokenu w trakcie sesji: token o krotkim accessTokenLifespan
//      (8s, patrz realm-fixture.template.json) faktycznie przestaje byc
//      przyjmowany przez userinfo endpoint IdP po uplywie czasu,
//   3. `insecure_tls` strona DYNAMICZNA: domyslny klient TLS bez zaufania do
//      lokalnego CA odmawia; klient z zaufaniem (--cacert) przechodzi -
//      mierzone tu przez `curl` w uruchom-idp.sh/README, potwierdzone TU przez
//      `fetch` Node z/bez `NODE_EXTRA_CA_CERTS`.
//
// Uzycie: node pomiar-idp-samodzielny.mjs <katalog-stanu-biegu>
// (katalog stanu = frontend/e2e/logowanie/.stan/<BIEG>, zapisany przez
// uruchom-idp.sh start - niesie port, cert.pem, realm.json wyrenderowany).

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const katalogStanu = process.argv[2];
if (!katalogStanu) {
  console.error("uzycie: node pomiar-idp-samodzielny.mjs <katalog-stanu-biegu>");
  process.exit(2);
}

const port = fs.readFileSync(path.join(katalogStanu, "port"), "utf8").trim();
const caPath = path.join(katalogStanu, "tls", "cert.pem");
const realm = JSON.parse(fs.readFileSync(path.join(katalogStanu, "realm.json"), "utf8"));
const haslo = realm.users[0].credentials[0].value; // ta sama syntetyczna wartosc dla kazdego usera tego biegu

const ISSUER = `https://localhost:${port}/realms/niepodzielni`;

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkcePair() {
  const crypto = await import("node:crypto");
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Przechodzi PRAWDZIWY ekran logowania Keycloak (ten sam formularz, ktorego
 * uzywa kazdy klient, wliczajac psychon-web) dla podanego uzytkownika i
 * zwraca `code` z przekierowania powrotnego - bez zadnego udzialu frontu.
 */
async function zalogujDoKeycloakaIOdbierzKod(browser, username) {
  const { verifier, challenge } = await pkcePair();
  const state = b64url(await import("node:crypto").then((c) => c.randomBytes(16)));
  // MUSI byc URI zarejestrowany na kliencie psychon-web (realm-fixture.template.json)
  // - Keycloak odrzuca nieznany redirect_uri PRZED pokazaniem ekranu logowania
  // (kontrakt SS3: "Nieznany redirect_uri = HTTP 400"). Nic nie musi tam realnie
  // nasluchiwac: przechwytujemy nawigacje przez page.route() PRZED wyjsciem w siec.
  // Zgodny z tym samym web origin, ktory otrzymal uruchom-idp.sh przy starcie
  // (PSYCHON_E2E_WEB_ORIGIN) - realm zna DOKLADNIE jeden redirect_uri per klient,
  // domyslny port 3000 zostaje jako wartosc wsteczna dla pomiarow uruchamianych
  // samodzielnie, bez calego biegu (patrz README).
  const redirectUri = `${process.env.PSYCHON_E2E_WEB_ORIGIN ?? "http://localhost:3000"}/api/auth/callback/keycloak`;

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Kod wyciagamy z SAMEGO zdarzenia zadania (synchronicznie, w momencie
  // wystapienia), nie z asynchronicznego route-handlera: Chromium potrafi
  // pokazac chrome-error dla nieistniejacego hosta NAWET gdy `route.fulfill()`
  // juz odpowiedzial (zmierzone) - ale zadanie ze "code" w query juz padlo i
  // to ono jest dowodem udanego zalogowania, niezaleznie od tego, co przegladarka
  // zrobi z odpowiedzia dalej.
  let capturedCode = null;
  page.on("request", (req) => {
    if (req.url().startsWith(redirectUri)) {
      capturedCode = new URL(req.url()).searchParams.get("code");
    }
  });
  await page.route(/^http:\/\/localhost:3000\//, async (route) => {
    await route.fulfill({ status: 200, body: "ok" });
  });

  const authUrl = new URL(`${ISSUER}/protocol/openid-connect/auth`);
  authUrl.searchParams.set("client_id", "psychon-web");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  await page.goto(authUrl.toString());
  // Selektory PO ID, nie po etykiecie: motyw login-pf/keycloak.v2 renderuje
  // etykiety z polskimi znakami ("Nazwa użytkownika", "Hasło"), a przycisk
  // niesie tekst "Logowanie" - zaden dopasowany wczesniejszym zgadywaniem po
  // angielsku/bez ogonkow (zmierzone: kazde nietrafione dopasowanie czeka
  // pelny domyslny czas akcjonowalnosci Playwrighta, ok. 30s, zanim spadnie
  // do awaryjnego selektora - trzy takie oczekiwania z rzedu przekraczaly
  // watchdog tej funkcji). ID sa czescia kontraktu formularza Keycloaka
  // (login-pf), nie tego motywu - stabilniejsze niz tlumaczony tekst.
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(haslo);
  await page.locator("#kc-login").click();

  await page.waitForURL(/localhost:3000\/api\/auth\/callback\/keycloak/, { timeout: 15_000 }).catch(() => {});
  if (!capturedCode) {
    try {
      capturedCode = new URL(page.url()).searchParams.get("code");
    } catch { /* url moze byc chrome-error:// - ignorujemy, zglosimy nizej */ }
  }
  if (!capturedCode) {
    console.error(`[debug] url koncowa=${page.url()}`);
    console.error(`[debug] tresc=${(await page.content()).slice(0, 2000)}`);
  }
  await context.close();

  if (!capturedCode) throw new Error(`brak "code" w przekierowaniu dla ${username} - logowanie przegladarkowe nie doszlo do skutku`);
  return { code: capturedCode, verifier, redirectUri };
}

async function wymienKodNaToken({ code, verifier, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: "psychon-web",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    // uwaga (bez dyrektywy ts-*, .mjs nie jest sprawdzany typami): Node fetch (undici)
    // honoruje NODE_EXTRA_CA_CERTS z env, ustawionego przez wywolujacego
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token endpoint: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

function decodeJwt(token) {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

async function main() {
  // UWAGA: `NODE_EXTRA_CA_CERTS` musi byc USTAWIONE PRZED startem procesu Node -
  // undici (fetch) buduje swoj agent TLS raz, przy pierwszym uzyciu; ustawienie
  // `process.env` W TRAKCIE dzialania (zmierzone) NIE dziala - stad ten skrypt
  // WYMAGA zmiennej juz w srodowisku wywolania (patrz komentarz przy wywolaniu
  // w README/uruchom-idp.sh), tu tylko to sprawdzamy i odmawiamy zamiast cicho
  // dawac fetch-y bez zaufania do CA.
  if (path.resolve(process.env.NODE_EXTRA_CA_CERTS ?? "") !== path.resolve(caPath)) {
    console.error(
      `BLAD: uruchom z NODE_EXTRA_CA_CERTS="${caPath}" w SRODOWISKU WYWOLANIA (undici czyta ja raz, na starcie procesu).`,
    );
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const wyniki = [];

  const doZmierzenia = [
    ["e2e-admin-fundacja", "super_admin", "admin-fundacja"],
    ["e2e-koordynator", "project_manager", "koordynator"],
    ["e2e-prowadzacy", "instructor", "prowadzacy"],
    ["e2e-wolontariusz", "volunteer", "wolontariusz"],
    ["e2e-pacjent", "student", "pacjent"],
  ];

  const zWatchdogiem = (obietnica, etykieta, msMax = 30_000) =>
    Promise.race([
      obietnica,
      new Promise((_, odrzuc) => setTimeout(() => odrzuc(new Error(`watchdog: "${etykieta}" przekroczyl ${msMax}ms`)), msMax)),
    ]);

  for (const [username, rolaLokalna, rolaRealmu] of doZmierzenia) {
    const { code, verifier, redirectUri } = await zWatchdogiem(
      zalogujDoKeycloakaIOdbierzKod(browser, username),
      `logowanie ${username}`,
    );
    const tokenSet = await zWatchdogiem(wymienKodNaToken({ code, verifier, redirectUri }), `wymiana kodu ${username}`);
    const payload = decodeJwt(tokenSet.access_token);
    const maRole = (payload.realm_access?.roles ?? []).includes(rolaRealmu);
    wyniki.push({ username, rolaLokalna, rolaRealmu, maRole, exp: payload.exp, iat: payload.iat });
    console.log(`[noga] ${username} -> rola_lokalna=${rolaLokalna} rola_realmu_w_tokenie=${rolaRealmu} obecna=${maRole} exp-iat=${payload.exp - payload.iat}s`);
  }

  const wszystkieOk = wyniki.every((w) => w.maRole);
  console.log(`[podsumowanie-rol] ${wyniki.filter((w) => w.maRole).length}/${wyniki.length} tokenow niesie oczekiwana role realmu`);

  // --- kryterium 5: wygasniecie tokenu w trakcie sesji ---
  // Token WLASNY tego pomiaru, pobrany TERAZ - nie recykling tokenu z petli
  // wyzej: 5 prawdziwych logowan przegladarkowych zajmuje realny czas, ktory
  // (zmierzone) juz sam przekracza 8s zycia tokenu testowego realmu, wiec
  // token sprzed petli bylby juz wygasly zanim dojdzie tu sterowanie -
  // "PRZED uplywem" wyszloby falszywie jako 401, nie dlatego, ze IdP dziala
  // zle, tylko dlatego, ze pomiar sprawdzalby zly moment w czasie.
  const { code: kodWygasniecia, verifier: verifierWygasniecia, redirectUri: redirectWygasniecia } =
    await zWatchdogiem(zalogujDoKeycloakaIOdbierzKod(browser, "e2e-admin-fundacja"), "logowanie do pomiaru wygasniecia");
  const tokenSetWygasniecia = await zWatchdogiem(
    wymienKodNaToken({ code: kodWygasniecia, verifier: verifierWygasniecia, redirectUri: redirectWygasniecia }),
    "wymiana kodu do pomiaru wygasniecia",
  );
  const tokenDoWygasniecia = tokenSetWygasniecia.access_token;
  const payloadWygasniecia = decodeJwt(tokenDoWygasniecia);

  await browser.close();

  const zycieTokenu = payloadWygasniecia.exp - payloadWygasniecia.iat;
  console.log(`[wygasniecie] access token zyje ${zycieTokenu}s w tym realmie testowym (kontrakt produkcyjny: 600s - ta wartosc jest WLASNA dla realmu efemerycznego, wybrana zeby zmierzyc to bez dlugiego czekania)`);

  const przedWygasnieciem = await fetch(`${ISSUER}/protocol/openid-connect/userinfo`, {
    headers: { Authorization: `Bearer ${tokenDoWygasniecia}` },
  });
  console.log(`[wygasniecie] userinfo PRZED uplywem ${zycieTokenu}s: HTTP ${przedWygasnieciem.status} (oczekiwane 200)`);

  const czekaj = (zycieTokenu + 4) * 1000;
  console.log(`[wygasniecie] czekam ${czekaj}ms na uplyniecie tokenu...`);
  await new Promise((r) => setTimeout(r, czekaj));

  const poWygasnieciu = await fetch(`${ISSUER}/protocol/openid-connect/userinfo`, {
    headers: { Authorization: `Bearer ${tokenDoWygasniecia}` },
  });
  const cialoPoWygasnieciu = await poWygasnieciu.text();
  console.log(`[wygasniecie] userinfo PO uplywie: HTTP ${poWygasnieciu.status} (oczekiwane 401) cialo=${cialoPoWygasnieciu.slice(0, 200)}`);

  process.exitCode = wszystkieOk && przedWygasnieciem.status === 200 && poWygasnieciu.status === 401 ? 0 : 1;
}

main().catch((err) => {
  console.error("BLAD:", err.stack || err.message || err);
  process.exit(1);
});
