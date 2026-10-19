import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const port = 9377;
const out = "C:\\examsprep\\app\\.tmp-shots";
fs.mkdirSync(out, { recursive: true });
const proc = spawn(
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${out}\\profile-verify`,
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

let version;
for (let i = 0; i < 40; i++) {
  try {
    version = await getJson(`http://127.0.0.1:${port}/json/version`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}

const browser = new WebSocket(version.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
browser.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
await new Promise((resolve) => browser.addEventListener("open", resolve));
const send = (method, params = {}, sessionId) => {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, (message) =>
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result),
    );
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    browser.send(JSON.stringify(payload));
  });
};
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const call = (method, params) => send(method, params, sessionId);
const evalJs = async (expression) => {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const shot = async (name) => {
  const { data } = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${out}\\${name}.png`, Buffer.from(data, "base64"));
};
const vis = (sel) =>
  `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return !!(el && getComputedStyle(el).display !== "none"); })()`;

await call("Page.enable");
await call("Runtime.enable");
await call("Page.setLifecycleEventsEnabled", { enabled: true });
await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await call("Page.navigate", { url: "http://localhost:3000/" });
await new Promise((r) => setTimeout(r, 2800));

await evalJs(`document.documentElement.dataset.theme="light"; localStorage.setItem("theme","light"); document.querySelector(".features-panel")?.classList.add("is-on");`);
await new Promise((r) => setTimeout(r, 500));
const light = await evalJs(`({
  theme: document.documentElement.dataset.theme,
  lightLogo: ${vis(".logo-crop.theme-light")},
  darkMark: ${vis(".logo-mark.theme-dark")},
  darkLogoFile: !!document.querySelector('img[src*="logo_dark"]'),
  lightHero: ${vis(".hero-shot.theme-light")},
  darkHero: ${vis(".hero-shot.theme-dark")},
  more: document.querySelector(".features-more")?.getAttribute("href"),
  moreText: document.querySelector(".features-more")?.textContent.replace(/\\s+/g," ").trim(),
  mock: !!document.querySelector(".features-mock"),
  header: !!document.querySelector(".site-header"),
  footer: !!document.querySelector(".site-footer"),
  lessonAnim: getComputedStyle(document.querySelector(".lesson-line.is-hi")).animationName,
  barAnim: getComputedStyle(document.querySelector(".progress-bar")).animationName,
  ringAnim: getComputedStyle(document.querySelector(".progress-fill")).animationName,
})`);
console.log("home-light", JSON.stringify(light));
await shot("verify-home-light");

await evalJs(`document.querySelector("#features")?.scrollIntoView({block:"start"});`);
await new Promise((r) => setTimeout(r, 400));
await shot("verify-features-light");

await evalJs(`document.documentElement.dataset.theme="dark";`);
await new Promise((r) => setTimeout(r, 400));
const dark = await evalJs(`({
  theme: document.documentElement.dataset.theme,
  lightLogo: ${vis(".logo-crop.theme-light")},
  darkMark: ${vis(".logo-mark.theme-dark")},
  lightHero: ${vis(".hero-shot.theme-light")},
  darkHero: ${vis(".hero-shot.theme-dark")},
  heroFrameBg: getComputedStyle(document.querySelector(".hero-art")).backgroundColor,
})`);
console.log("home-dark", JSON.stringify(dark));
await evalJs(`window.scrollTo(0,0);`);
await new Promise((r) => setTimeout(r, 250));
await shot("verify-home-dark");

const href = await evalJs(`document.querySelector(".features-more").href`);
await call("Page.navigate", { url: href });
await new Promise((r) => setTimeout(r, 2000));
const page = await evalJs(`({
  path: location.pathname,
  title: document.querySelector("#features-page-title")?.textContent,
  cards: document.querySelectorAll(".features-page-card").length,
  header: !!document.querySelector(".site-header"),
  footer: !!document.querySelector(".site-footer"),
  themeToggle: !!document.querySelector(".theme-toggle"),
})`);
console.log("features-page", JSON.stringify(page));
await shot("verify-features-page-dark");

await evalJs(`document.documentElement.dataset.theme="light";`);
await new Promise((r) => setTimeout(r, 300));
await shot("verify-features-page-light");

await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await call("Page.navigate", { url: "http://localhost:3000/" });
await new Promise((r) => setTimeout(r, 2000));
await evalJs(`document.documentElement.dataset.theme="light"; window.scrollTo(0,0);`);
await new Promise((r) => setTimeout(r, 400));
await shot("verify-mobile-light");
await evalJs(`document.documentElement.dataset.theme="dark";`);
await new Promise((r) => setTimeout(r, 400));
await shot("verify-mobile-dark");
await evalJs(`document.querySelector("#features")?.scrollIntoView({block:"start"});`);
await new Promise((r) => setTimeout(r, 400));
await shot("verify-mobile-features");

browser.close();
proc.kill();
