import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(
  process.env.FRONTEND_PACKAGE ?? resolve(root, "../../frontend/package.json"),
);
const frontendRoot = dirname(frontend);
const require = createRequire(frontend);
const { chromium, expect } = require("@playwright/test");
const { createServer } = await import(
  pathToFileURL(require.resolve("vite")).href
);
const { default: react } = await import(
  pathToFileURL(require.resolve("@vitejs/plugin-react")).href
);
const { default: tailwind } = await import(
  pathToFileURL(require.resolve("@tailwindcss/vite")).href
);
const aliases = Object.entries({
  "@fixture/sdk": "src/app/module-sdk.ts",
  "@fixture/registry": "src/app/module-registry.ts",
  "@fixture/i18n": "src/i18n/index.ts",
  "@fixture/style": "src/style.css",
  "@fixture/design": "src/design-system.css",
  "@fixture/home": "src/home/components.css",
}).map(([find, path]) => ({ find, replacement: resolve(frontendRoot, path) }));
for (const name of [
  "react/jsx-runtime",
  "react-dom/client",
  "react",
  "react-router-dom",
])
  aliases.push({
    find: new RegExp("^" + name + "$"),
    replacement: require.resolve(name),
  });
const server = await createServer({
  configFile: false,
  root,
  plugins: [react(), tailwind()],
  resolve: { alias: aliases },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root, frontendRoot] } },
});
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string")
  throw Error("The fixture server did not bind a local port");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const dictionaries = Object.fromEntries(
  await Promise.all(
    ["en", "ru", "uk"].map(async (language) => [
      language,
      JSON.parse(
        await readFile(
          resolve(root, `frontend/locales/${language}.json`),
          "utf8",
        ),
      ),
    ]),
  ),
);
const errors = [];

function socketMock() {
  window.__terminalSockets = [];
  window.__terminalCloseCalls = [];
  const NativeWebSocket = window.WebSocket;
  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) {
      if (!String(url).includes("/api/v1/terminal"))
        return new NativeWebSocket(url);
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      this.index = window.__terminalSockets.length;
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      window.__terminalSockets.push(this);
    }
    send() {}
    close() {
      window.__terminalCloseCalls.push(this.index);
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.({});
    }
    open() {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    }
    error() {
      this.onerror?.({});
    }
    remoteClose() {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.({});
    }
  }
  window.WebSocket = MockWebSocket;
}

async function visit(language, theme, surface, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (error) =>
    errors.push(`${language}/${theme}/${surface}/${width}: ${error.message}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(
        `${language}/${theme}/${surface}/${width}: ${message.text()}`,
      );
  });
  await page.addInitScript(socketMock);
  await page.goto(
    `${base}/tests/confirmations.html?${new URLSearchParams({ language, theme, surface })}`,
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: dictionaries[language].terminal_b7135883,
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const loadedFont = await page.evaluate(async () => {
    const faces = await document.fonts.load(
      '16px "Manrope Variable"',
      "Terminal",
    );
    return (
      faces.some(
        (face) =>
          face.family === "Manrope Variable" && face.status === "loaded",
      ) &&
      getComputedStyle(document.body).fontFamily.includes("Manrope Variable")
    );
  });
  assert.ok(
    loadedFont,
    `${language}/${theme}/${surface}/${width}: actual Manrope face loaded and applied`,
  );
  await expect
    .poll(() => page.evaluate(() => window.__terminalSockets.length))
    .toBe(1);
  return page;
}

async function inspect(page, action, width, identity, cancelLabel) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog
      .locator(".modal-footer")
      .getByRole("button", { name: cancelLabel, exact: true }),
  ).toBeFocused();
  await expect(action).toHaveClass(/danger/);
  await expect(async () => {
    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll(".modal-footer button")].map(
        (button) => {
          const bounds = button.getBoundingClientRect();
          return {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
            width: bounds.width,
            height: bounds.height,
            hits: [
              [0.5, 0.5],
              [0.1, 0.5],
              [0.9, 0.5],
              [0.5, 0.1],
              [0.5, 0.9],
            ].map(([x, y]) => {
              const target = document.elementFromPoint(
                bounds.left + bounds.width * x,
                bounds.top + bounds.height * y,
              );
              return {
                point: [x, y],
                inside: target === button || button.contains(target),
                target: target?.outerHTML.slice(0, 100),
              };
            }),
          };
        },
      );
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        buttons,
      };
    });
    assert.ok(
      geometry.left >= -1 &&
        geometry.right <= geometry.width + 1 &&
        geometry.top >= -1 &&
        geometry.bottom <= geometry.height + 1,
      `${identity} dialog bounds: ${JSON.stringify(geometry)}`,
    );
    assert.ok(
      geometry.scrollWidth <= width,
      `${identity} horizontal overflow: ${JSON.stringify(geometry)}`,
    );
    assert.ok(
      geometry.buttons.length === 2 &&
        geometry.buttons.every(
          (button) =>
            button.left >= -1 &&
            button.right <= width + 1 &&
            button.top >= -1 &&
            button.bottom <= geometry.height + 1 &&
            button.width >= 44 &&
            button.height >= 44 &&
            button.hits.every((hit) => hit.inside),
        ),
      `${identity} footer button bounds, targets and hit points: ${JSON.stringify(geometry)}`,
    );
  }).toPass({ timeout: 5000 });
  return dialog;
}

try {
  const page = await visit("en", "light", "solid", 1440);
  const t = dictionaries.en;
  const dialog = page.getByRole("dialog");
  const closeOneName = t.terminalCloseTitle.replace("{{id}}", "1");
  const closeOne = page.getByRole("button", {
    name: closeOneName,
    exact: true,
  });
  await closeOne.click();
  await expect(
    dialog.getByRole("heading", { name: closeOneName, exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "Running commands may be interrupted and terminal output will be cleared.",
  );
  const cancel = dialog.getByRole("button", { name: t.cancel, exact: true });
  const closeOneConfirm = dialog.getByRole("button", {
    name: closeOneName,
    exact: true,
  });
  await expect(cancel).toBeFocused();
  await inspect(page, closeOneConfirm, 1440, "individual close", t.cancel);
  await page.evaluate(() => window.__terminalSockets[0].open());
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(closeOne).toBeFocused();
  assert.deepEqual(
    await page.evaluate(() => window.__terminalCloseCalls),
    [],
    "Cancel leaves the connecting socket open",
  );
  const retainedHost = page.locator(".terminal-session-host");
  await retainedHost.evaluate((element) =>
    element.setAttribute("data-retained", "yes"),
  );
  await page.getByRole("link", { name: "Leave terminal", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Other view", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__terminalSockets.length))
    .toBe(1);
  assert.deepEqual(
    await page.evaluate(() => window.__terminalCloseCalls),
    [],
    "navigation away leaves the terminal socket open",
  );
  await page
    .getByRole("link", { name: "Return to terminal", exact: true })
    .click();
  await expect(retainedHost).toHaveAttribute("data-retained", "yes");
  await expect(
    page.getByRole("heading", { name: t.terminal_b7135883, exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__terminalSockets.length))
    .toBe(1);
  assert.deepEqual(
    await page.evaluate(() => window.__terminalCloseCalls),
    [],
    "returning to the terminal neither closes nor recreates the socket",
  );

  await page.evaluate(() => window.__terminalSockets[0].error());
  await expect(
    page.getByRole("img", { name: t.connection_error_0e1c60a0 }),
  ).toBeVisible();
  await closeOne.click();
  await expect(cancel).toBeFocused();
  await closeOneConfirm.click();
  await expect(page.locator(".terminal-panel")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__terminalCloseCalls))
    .toEqual([0]);
  await expect(page.locator("[data-terminal-open]").first()).toBeFocused();

  await page
    .getByRole("button", { name: t.open_terminal_6c5b2221 })
    .last()
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__terminalSockets.length))
    .toBe(2);
  await page.evaluate(() => window.__terminalSockets[1].remoteClose());
  await expect(
    page.getByRole("img", { name: t.terminal_closed_c50ea89b }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: t.terminalCloseTitle.replace("{{id}}", "2"),
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".terminal-panel")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__terminalCloseCalls))
    .toEqual([0]);

  for (let index = 0; index < 2; index++)
    await page
      .getByRole("button", { name: t.open_terminal_6c5b2221 })
      .last()
      .click();
  await expect
    .poll(() => page.evaluate(() => window.__terminalSockets.length))
    .toBe(4);
  const indicator = page.locator(".terminal-activity > summary");
  await indicator.click();
  await page.getByRole("button", { name: t.stopAll, exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: t.stopAll, exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("Terminal 3, Terminal 4");
  const allCancel = dialog.getByRole("button", { name: t.cancel, exact: true });
  const closeAll = dialog.getByRole("button", {
    name: "Close terminals 3, 4",
    exact: true,
  });
  await expect(allCancel).toBeFocused();
  await inspect(page, closeAll, 1440, "close-all snapshot", t.cancel);
  await allCancel.click();
  await expect(indicator).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.__terminalCloseCalls))
    .toEqual([0]);

  await indicator.click();
  await page.getByRole("button", { name: t.stopAll, exact: true }).click();
  await expect(dialog).toContainText("Terminal 3, Terminal 4");
  await page
    .locator("[data-terminal-open]")
    .last()
    .evaluate((button) => button.click());
  await expect
    .poll(() => page.evaluate(() => window.__terminalSockets.length))
    .toBe(5);
  await expect(dialog).toContainText("Terminal 3, Terminal 4");
  await closeAll.click();
  await expect
    .poll(() => page.evaluate(() => window.__terminalCloseCalls))
    .toEqual([0, 2, 3]);
  await expect(page.locator(".terminal-panel")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Terminal 5" })).toBeVisible();
  await expect(page.locator(".terminal-activity > summary")).toContainText("1");
  await expect(page.locator(".terminal-activity > summary")).toBeFocused();

  await page.locator("[data-terminal-open]").last().click();
  await expect
    .poll(() => page.evaluate(() => window.__terminalSockets.length))
    .toBe(6);
  await page.locator(".terminal-activity > summary").click();
  await page.getByRole("button", { name: t.stopAll, exact: true }).click();
  await expect(dialog).toContainText("Terminal 5, Terminal 6");
  const closeLastTwo = dialog.getByRole("button", {
    name: "Close terminals 5, 6",
    exact: true,
  });
  await closeLastTwo.click();
  await expect
    .poll(() => page.evaluate(() => window.__terminalCloseCalls))
    .toEqual([0, 2, 3, 4, 5]);
  await expect(page.locator(".terminal-panel")).toHaveCount(0);
  await expect(page.locator(".terminal-activity > summary")).toHaveCount(0);
  await expect(page.locator("[data-terminal-open]").first()).toBeFocused();
  await page.close();

  for (const language of ["en", "ru", "uk"]) {
    for (const theme of ["light", "dark"]) {
      for (const surface of ["solid", "glass"]) {
        for (const width of [320, 1440]) {
          const matrixPage = await visit(language, theme, surface, width);
          const labels = dictionaries[language];
          const dialogPage = matrixPage.getByRole("dialog");
          const trigger = matrixPage.getByRole("button", {
            name: labels.terminalCloseTitle.replace("{{id}}", "1"),
            exact: true,
          });
          await trigger.click();
          const action = dialogPage.getByRole("button", {
            name: labels.terminalCloseTitle.replace("{{id}}", "1"),
            exact: true,
          });
          await expect(dialogPage).toContainText(
            labels.terminalCloseWarning.replace(
              "{{terminal}}",
              `${labels.terminal_b7135883} 1`,
            ),
          );
          await inspect(
            matrixPage,
            action,
            width,
            `${language}/${theme}/${surface}/${width}`,
            labels.cancel,
          );
          await dialogPage
            .getByRole("button", { name: labels.cancel, exact: true })
            .click();
          await expect(trigger).toBeFocused();
          assert.deepEqual(
            await matrixPage.evaluate(() => window.__terminalCloseCalls),
            [],
            `${language}/${theme}/${surface}/${width}: Cancel does not close socket`,
          );
          await trigger.click();
          await action.click();
          await expect(matrixPage.locator(".terminal-panel")).toHaveCount(0);
          await expect(
            matrixPage.locator("[data-terminal-open]:visible").first(),
          ).toBeFocused();
          assert.deepEqual(
            await matrixPage.evaluate(() => window.__terminalCloseCalls),
            [0],
          );
          await matrixPage.close();
        }
      }
    }
  }

  assert.deepEqual(errors, [], "no browser or console errors");
  console.log(
    "PASS built terminal module: live/closed state handling, Cancel safety, navigation persistence, exact close-all snapshot, last-session focus, loaded font, complete dialog geometry, and 24 locale/theme/viewport cases",
  );
} finally {
  await browser.close();
  await server.close();
}
