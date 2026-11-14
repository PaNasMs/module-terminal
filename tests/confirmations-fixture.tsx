import { createRoot } from "react-dom/client";
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { initializeLanguage } from "@fixture/i18n";
import { modules } from "@fixture/registry";
import "@fixture/sdk";
import "@fixture/style";
import "@fixture/design";
import "@fixture/home";

const params = new URLSearchParams(location.search);
await initializeLanguage(params.get("language") ?? "en");
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.dataset.surface = params.get("surface") ?? "solid";
const style = document.createElement("link");
style.rel = "stylesheet";
style.href = "/dist/ui/index.css";
document.head.append(style);
await new Promise<void>((resolve, reject) => {
  const script = document.createElement("script");
  script.src = "/dist/ui/index.js";
  script.onload = () => resolve();
  script.onerror = () => reject(Error("Built terminal bundle failed to load"));
  document.head.append(script);
});
const terminal = modules().find((module) => module.id === "terminal");
if (!terminal?.component || !terminal.backgroundIndicator)
  throw Error("Terminal module did not register");
const Page = terminal.component;
const Indicator = terminal.backgroundIndicator;
function Fixture() {
  const { pathname } = useLocation();
  const active = pathname === "/terminal";
  return (
    <>
      <nav aria-label="Fixture navigation">
        <Link to="/elsewhere">Leave terminal</Link>
        <Link to="/terminal">Return to terminal</Link>
      </nav>
      <nav className="application-bar" aria-label="Shell sections">
        <button
          className="app-launcher"
          data-testid="hidden-sections-control"
          hidden
          type="button"
        >
          Sections
        </button>
        <button
          className="app-launcher"
          data-testid="sections-control"
          type="button"
        >
          Sections
        </button>
      </nav>
      <header>
        <Indicator />
      </header>
      <main hidden={!active}>
        <Page active={active} />
      </main>
      {!active && <h1>Other view</h1>}
    </>
  );
}
const router = createMemoryRouter(
  [
    {
      path: "*",
      element: <Fixture />,
    },
  ],
  { initialEntries: ["/terminal"] },
);
createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
