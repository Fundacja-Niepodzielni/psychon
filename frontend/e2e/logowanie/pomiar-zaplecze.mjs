#!/usr/bin/env node
// Noga "przegladarka -> IdP -> front(pominiety) -> zaplecze (TokenValidator)":
// prawdziwe logowanie przegladarkowe (bez direct grantu) dla 5 rol, prawdziwy
// token wymieniony na kodzie/PKCE, wywolanie PRAWDZIWEGO, dzialajacego
// zaplecza Laravel (nie mocka) tym tokenem. Dwa tryby:
//   node pomiar-zaplecze.mjs suby            -> loguje 5 uzytkownikow, drukuje
//                                                same `sub` (nie sa sekretem -
//                                                to identyfikator do powiazania
//                                                kontem, ta sama wartosc, ktora
//                                                administrator dostaje z
//                                                `psychon:sso-powiaz`)
//   node pomiar-zaplecze.mjs wywolaj <backend-url>
//                                             -> loguje ponownie (swiezy token)
//                                                i wywoluje zaplecze
//
// Powielono minimalny fragment logowania z pomiar-idp-samodzielny.mjs (ten sam
// katalog) celowo - to osobny, samodzielny pomiar innej nogi (front->zaplecze),
// nie chcemy dzielic stanu watchdogow/przegladarki z tamtym plikiem.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const katalogStanu = process.env.PSYCHON_IDP_STATE_DIR;
if (!katalogStanu) {
  console.error("BLAD: ustaw PSYCHON_IDP_STATE_DIR na katalog .stan/<bieg> uruchom-idp.sh");
  process.exit(2);
}
const port = fs.readFileSync(path.join(katalogStanu, "port"), "utf8").trim();
const realm = JSON.parse(fs.readFileSync(path.join(katalogStanu, "realm.json"), "utf8"));
const haslo = realm.users[0].credentials[0].value;
const ISSUER = `https://localhost:${port}/realms/niepodzielni`;

function b64url(buf) { return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function pkcePair() {
  const crypto = await import("node:crypto");
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function zalogujIOdbierzToken(browser, username) {
  const { verifier, challenge } = await pkcePair();
  const state = b64url(await import("node:crypto").then((c) => c.randomBytes(16)));
  // Zgodny z tym samym web origin, ktory otrzymal uruchom-idp.sh przy starcie
  // (PSYCHON_E2E_WEB_ORIGIN) - realm zna DOKLADNIE jeden redirect_uri per klient.
  const redirectUri = `${process.env.PSYCHON_E2E_WEB_ORIGIN ?? "http://localhost:3000"}/api/auth/callback/keycloak`;
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  let capturedCode = null;
  page.on("request", (req) => {
    if (req.url().startsWith(redirectUri)) capturedCode = new URL(req.url()).searchParams.get("code");
  });
  await page.route(/^http:\/\/localhost:3000\//, async (route) => { await route.fulfill({ status: 200, body: "ok" }); });
  const authUrl = new URL(`${ISSUER}/protocol/openid-connect/auth`);
  authUrl.searchParams.set("client_id", "psychon-web");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  await page.goto(authUrl.toString());
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(haslo);
  await page.locator("#kc-login").click();
  await page.waitForURL(/localhost:3000\/api\/auth\/callback\/keycloak/, { timeout: 15_000 }).catch(() => {});
  if (!capturedCode) { try { capturedCode = new URL(page.url()).searchParams.get("code"); } catch {} }
  await context.close();
  if (!capturedCode) throw new Error(`brak "code" dla ${username}`);
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: "psychon-web", code: capturedCode, redirect_uri: redirectUri, code_verifier: verifier });
  const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = await res.json();
  if (!res.ok) throw new Error(`token endpoint: ${res.status} ${JSON.stringify(json)}`);
  return json.access_token;
}
function decodeJwt(token) { const [, p] = token.split("."); return JSON.parse(Buffer.from(p, "base64url").toString("utf8")); }

const ROLE = [
  ["e2e-admin-fundacja", "super_admin"],
  ["e2e-koordynator", "project_manager"],
  ["e2e-prowadzacy", "instructor"],
  ["e2e-wolontariusz", "volunteer"],
  ["e2e-pacjent", "student"],
];

// Trasa kontraktowa uzyta na noge front->zaplecze dla kazdej roli (SS2 kontraktu):
// wybrana tak, zeby kazda z 5 rol miala WLASNA, dozwolona jej trase - `GET /me`
// jest dostepne kazdej zalogowanej roli i czyta z lokalnej bazy (potwierdza
// pelna sciezke TokenValidator -> KeycloakGuardResolver -> kontroler -> DB).
const TRASA_WSPOLNA = "/api/v1/me";
// Trasa swiadka kryterium 2: dozwolona TYLKO project_manager/super_admin.
const TRASA_SWIADKA = "/api/v1/admin/reliability";

async function main() {
  const tryb = process.argv[2];
  const backendUrl = process.argv[3];
  const browser = await chromium.launch({ headless: true });

  if (tryb === "suby") {
    for (const [username] of ROLE) {
      const token = await zalogujIOdbierzToken(browser, username);
      const { sub } = decodeJwt(token);
      console.log(`${username} ${sub}`);
    }
    await browser.close();
    return;
  }

  if (tryb === "wywolaj") {
    if (!backendUrl) { console.error("uzycie: wywolaj <backend-url>"); process.exit(2); }
    let wszystkoOk = true;
    for (const [username, rolaOczekiwana] of ROLE) {
      const token = await zalogujIOdbierzToken(browser, username);
      const payload = decodeJwt(token);
      const rolaWTokenie = (payload.realm_access?.roles ?? []).find((r) => true);
      const res = await fetch(`${backendUrl}${TRASA_WSPOLNA}`, { headers: { Authorization: `Bearer ${token}` } });
      const status = res.status;
      const ok = status === 200;
      wszystkoOk = wszystkoOk && ok;
      console.log(`[front->zaplecze] ${username} (token niesie role realmu: ${JSON.stringify(payload.realm_access?.roles)}) GET ${TRASA_WSPOLNA} -> HTTP ${status} (oczekiwane 200)`);
      if (username === "e2e-koordynator") {
        const resSwiadek = await fetch(`${backendUrl}${TRASA_SWIADKA}`, { headers: { Authorization: `Bearer ${token}` } });
        const cialo = await resSwiadek.text();
        console.log(`[swiadek-kryterium-2] ${username} (DB rola=volunteer, token rola=project_manager) GET ${TRASA_SWIADKA} -> HTTP ${resSwiadek.status} (oczekiwane 200 mimo DB=volunteer) cialo=${cialo.slice(0,200)}`);
        wszystkoOk = wszystkoOk && resSwiadek.status === 200;
      }
    }
    await browser.close();
    process.exitCode = wszystkoOk ? 0 : 1;
    return;
  }

  console.error("uzycie: suby | wywolaj <backend-url>");
  process.exit(2);
}

main().catch((err) => { console.error("BLAD:", err.stack || err.message || err); process.exit(1); });
