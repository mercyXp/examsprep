import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const port = 9371;
const out = "C:\\examsprep\\app\\.tmp-shots";
fs.mkdirSync(out, { recursive: true });
const proc = spawn(
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${out}\\profile-assets`,
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
  return result.result.value;
};
const shot = async (name) => {
  const { data } = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${out}\\${name}.png`, Buffer.from(data, "base64"));
};
const assets = () =>
  evalJs(`(() => {
    const vis = (el) => el && getComputedStyle(el).display !== "none";
    const lightLogo = document.querySelector(".logo-lockup.theme-light");
    const darkLogo = document.querySelector(".logo-lockup.theme-dark");
    const lightHero = document.querySelector(".hero-shot.theme-light");
    const darkHero = document.querySelector(".hero-shot.theme-dark");
    return {
      theme: document.documentElement.dataset.theme,
      lightLogo: vis(lightLogo),
      darkLogo: vis(darkLogo),
      lightHero: vis(lightHero),
      darkHero: vis(darkHero),
      lightLogoSrc: lightLogo?.currentSrc || lightLogo?.src,
      darkLogoSrc: darkLogo?.currentSrc || darkLogo?.src,
      lightHeroSrc: lightHero?.currentSrc || lightHero?.src,
      darkHeroSrc: darkHero?.currentSrc || darkHero?.src,
    };
  })()`);

await call("Page.enable");
await call("Runtime.enable");
await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await call("Page.navigate", { url: "http://localhost:3000/" });
await new Promise((r) => setTimeout(r, 2500));
await evalJs(`document.documentElement.dataset.theme="light"; localStorage.setItem("theme","light");`);
await new Promise((r) => setTimeout(r, 400));
console.log("light", JSON.stringify(await assets()));
await shot("assets-light");

await evalJs(`document.documentElement.dataset.theme="dark"; localStorage.setItem("theme","dark");`);
await new Promise((r) => setTimeout(r, 400));
console.log("dark", JSON.stringify(await assets()));
await shot("assets-dark");

await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await evalJs(`window.scrollTo(0,0);`);
await new Promise((r) => setTimeout(r, 300));
await shot("assets-dark-mobile");
await evalJs(`document.documentElement.dataset.theme="light";`);
await new Promise((r) => setTimeout(r, 300));
await shot("assets-light-mobile");

browser.close();
proc.kill();
