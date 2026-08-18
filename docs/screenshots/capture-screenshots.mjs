import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ORIGIN =
  process.env.CARETRACK_SCREENSHOT_WEB ?? "http://localhost:4173";
const API_ORIGIN =
  process.env.CARETRACK_SCREENSHOT_API ?? "http://localhost:3000/api/v1";
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUTPUT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEMO_PASSWORD = "CareTrack-Demo-2026!";
const REMOTE_DEBUGGING_PORT = 9223;

const wait = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolvePromise, rejectPromise) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener(
        "error",
        () =>
          rejectPromise(
            new Error("Could not connect to the Chrome DevTools Protocol."),
          ),
        { once: true },
      );
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

async function waitForChrome() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${REMOTE_DEBUGGING_PORT}/json/list`,
      );
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome is still starting.
    }
    await wait(200);
  }
  throw new Error(
    "Chrome did not expose a page debugging target within 20 seconds.",
  );
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.text ?? "Browser evaluation failed.",
    );
  }
  return result.result?.value;
}

async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await evaluate(client, "document.readyState === 'complete'")) return;
    await wait(100);
  }
  throw new Error(`Page did not finish loading: ${url}`);
}

async function waitForText(client, required, forbidden = [], timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const text = await evaluate(client, 'document.body?.innerText ?? ""');
    if (
      required.every((value) => text.includes(value)) &&
      forbidden.every((value) => !text.includes(value))
    ) {
      return text;
    }
    if (
      text.includes("Dashboard unavailable") ||
      text.includes("Session check failed") ||
      text.includes("could not be loaded")
    ) {
      throw new Error(
        `The rendered page reported an error: ${text.slice(0, 600)}`,
      );
    }
    await wait(200);
  }
  const finalText = await evaluate(client, 'document.body?.innerText ?? ""');
  throw new Error(
    `Timed out waiting for rendered content: ${required.join(", ")}. Visible text: ${finalText.slice(0, 600)}`,
  );
}

async function setViewport(client, width, height, mobile = false) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

async function stabilizePage(client) {
  await evaluate(
    client,
    `(() => {
      let style = document.getElementById('caretrack-capture-stability');
      if (!style) {
        style = document.createElement('style');
        style.id = 'caretrack-capture-stability';
        style.textContent = '* { animation: none !important; transition: none !important; caret-color: transparent !important; } html { scroll-behavior: auto !important; }';
        document.head.appendChild(style);
      }
      window.scrollTo(0, 0);
      return true;
    })()`,
  );
  await wait(250);
}

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Chrome returned a file that is not a PNG.");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function capture(client, filename, width, height, options = {}) {
  await setViewport(client, width, height, options.mobile ?? false);
  if (options.scrollSelector) {
    await evaluate(
      client,
      `document.querySelector(${JSON.stringify(options.scrollSelector)})?.scrollIntoView({ block: 'start' })`,
    );
  } else {
    await stabilizePage(client);
  }
  await wait(350);
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const buffer = Buffer.from(result.data, "base64");
  const dimensions = pngDimensions(buffer);
  if (dimensions.width !== width || dimensions.height !== height) {
    throw new Error(
      `${filename} is ${dimensions.width}x${dimensions.height}; expected ${width}x${height}.`,
    );
  }
  writeFileSync(join(OUTPUT_DIRECTORY, filename), buffer);
  return { filename, ...dimensions, bytes: buffer.length };
}

async function login(email) {
  const response = await fetch(`${API_ORIGIN}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(
      `Synthetic ${email} login failed with HTTP ${response.status}.`,
    );
  }
  const payload = await response.json();
  if (!payload.accessToken)
    throw new Error(`Synthetic ${email} login returned no access token.`);
  return payload.accessToken;
}

async function setAccessToken(client, token) {
  await navigate(client, `${FRONTEND_ORIGIN}/login`);
  await evaluate(
    client,
    `sessionStorage.setItem('caretrack.accessToken', ${JSON.stringify(token)}); localStorage.removeItem('accessToken'); true`,
  );
}

async function clickButton(client, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const element = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === ${JSON.stringify(label)});
      if (!element) return false;
      element.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error(`Could not find button labelled "${label}".`);
}

async function main() {
  const health = await fetch(`${API_ORIGIN}/health`);
  const web = await fetch(`${FRONTEND_ORIGIN}/login`);
  if (!health.ok || !web.ok) {
    throw new Error(
      "The local API and production frontend preview must be running before capture.",
    );
  }

  const profileDirectory = mkdtempSync(
    join(tmpdir(), "caretrack-screenshot-chrome-"),
  );
  if (!resolve(profileDirectory).startsWith(resolve(tmpdir()))) {
    throw new Error(
      "Refusing to use a Chrome profile outside the operating-system temporary directory.",
    );
  }
  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--force-device-scale-factor=1",
      `--remote-debugging-port=${REMOTE_DEBUGGING_PORT}`,
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );

  const captures = [];
  let client;
  try {
    client = new CdpClient(await waitForChrome());
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await setViewport(client, 1440, 900, false);

    await navigate(client, `${FRONTEND_ORIGIN}/login`);
    await evaluate(
      client,
      "sessionStorage.clear(); localStorage.removeItem('accessToken'); true",
    );
    await navigate(client, `${FRONTEND_ORIGIN}/login`);
    await waitForText(client, [
      "Sign in to CareTrack",
      "Forgot your password?",
    ]);
    captures.push(await capture(client, "01-login.png", 1440, 900));

    const patientToken = await login("maya.patient@example.test");
    await setAccessToken(client, patientToken);

    await navigate(client, `${FRONTEND_ORIGIN}/dashboard`);
    await waitForText(
      client,
      ["Maya, here's your day.", "Today's medications"],
      ["Loading today's medications"],
    );
    captures.push(await capture(client, "04-patient-dashboard.png", 1440, 900));

    await navigate(client, `${FRONTEND_ORIGIN}/appointments`);
    await waitForText(
      client,
      ["Appointments", "Upcoming and past visits"],
      ["Loading appointments"],
    );
    captures.push(await capture(client, "05-appointments.png", 1440, 900));

    await navigate(client, `${FRONTEND_ORIGIN}/notifications`);
    await waitForText(
      client,
      ["Notification center", "Urgent alert sent", "Notification preferences"],
      ["Loading notifications"],
    );
    captures.push(
      await capture(client, "07-notifications-preferences.png", 1440, 900),
    );
    captures.push(
      await capture(client, "07b-notification-topics.png", 1440, 900, {
        scrollSelector: ".notification-preferences-card",
      }),
    );

    await navigate(client, `${FRONTEND_ORIGIN}/history`);
    await waitForText(
      client,
      ["Medical history", "Your latest care activity", "Doctor notes"],
      ["Building your medical timeline"],
    );
    captures.push(await capture(client, "08-medical-history.png", 1440, 900));

    await navigate(client, `${FRONTEND_ORIGIN}/goals`);
    await waitForText(
      client,
      ["Health goals", "Daily walking target", "Medication consistency"],
      ["Loading goals"],
    );
    captures.push(await capture(client, "09-health-goals.png", 1440, 900));

    await navigate(client, `${FRONTEND_ORIGIN}/emergency`);
    await waitForText(client, [
      "Request help from your care contacts",
      "Latest recorded readings",
      "Urgent event already active",
    ]);
    captures.push(
      await capture(client, "10-emergency-mode.png", 390, 844, {
        mobile: true,
        scrollSelector: ".emergency-grid",
      }),
    );
    captures.push(
      await capture(client, "10b-emergency-readings.png", 390, 844, {
        mobile: true,
      }),
    );

    await navigate(client, `${FRONTEND_ORIGIN}/reports`);
    await waitForText(
      client,
      [
        "Health reports",
        "Medication adherence",
        "Recorded health data over time",
      ],
      ["Generating report"],
    );
    captures.push(await capture(client, "11-health-report.png", 1440, 900));

    await navigate(client, `${FRONTEND_ORIGIN}/security`);
    await waitForText(
      client,
      ["Security and sessions", "Active sessions", "Security events"],
      ["Loading active sessions"],
    );
    captures.push(await capture(client, "12-session-security.png", 1440, 900));

    const doctorToken = await login("rowan.doctor@example.test");
    await setAccessToken(client, doctorToken);
    await navigate(client, `${FRONTEND_ORIGIN}/doctor`);
    await waitForText(
      client,
      ["Welcome, Dr. Rowan", "Assigned patients", "Patients needing attention"],
      ["Loading your care team"],
    );
    captures.push(await capture(client, "13-doctor-dashboard.png", 1440, 900));

    const adminToken = await login("avery.admin@example.test");
    await setAccessToken(client, adminToken);
    await navigate(client, `${FRONTEND_ORIGIN}/admin`);
    await waitForText(
      client,
      ["CareTrack operations", "All users", "Recent audit activity"],
      ["Loading administration data"],
    );
    captures.push(await capture(client, "15-admin-dashboard.png", 1440, 900));
    await clickButton(client, "Assignments");
    await waitForText(client, [
      "Assign doctor to patient",
      "Doctor–patient assignments",
    ]);
    captures.push(await capture(client, "17-admin-assignment.png", 1440, 900));
    await clickButton(client, "Audit log");
    await waitForText(client, ["SECURITY RECORD", "APPOINTMENT LIST ACCESSED"]);
    captures.push(await capture(client, "18-audit-log.png", 1440, 900));

    await setViewport(client, 1440, 900, false);
    await navigate(client, "http://localhost:3000/api/v1/docs");
    await waitForText(
      client,
      ["Medical Tracking API", "OpenAPI", "Authorize"],
      [],
      30_000,
    );
    captures.push(await capture(client, "21-swagger-openapi.png", 1440, 900));
  } finally {
    client?.close();
    chrome.kill();
    await wait(250);
    if (resolve(profileDirectory).startsWith(resolve(tmpdir()))) {
      rmSync(profileDirectory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  }

  for (const item of captures) {
    console.log(
      `${item.filename}\t${item.width}x${item.height}\t${item.bytes} bytes`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
