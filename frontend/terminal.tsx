import {
  mdiConsole,
  mdiClose,
  mdiRefresh,
  mdiPlus,
  mdiCheckCircleOutline,
  mdiLoading,
  mdiAlertCircleOutline,
  mdiLanDisconnect,
  mdiStop,
} from "@mdi/js";
import { tr } from "./i18n";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";
import { Button, Icon, DialogContent } from "@panasms/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
const liveSessions = new Set<number>();
const listeners = new Set<() => void>();
const stopListeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => liveSessions.size;
function setLive(id: number, live: boolean) {
  if (live) liveSessions.add(id);
  else liveSessions.delete(id);
  listeners.forEach((listener) => listener());
}
function TerminalIndicator() {
  const count = useSyncExternalStore(subscribe, snapshot);
  const menu = useRef<HTMLDetailsElement>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && menu.current)
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  if (!count) return null;
  return (
    <>
      <details ref={menu} className="profile-menu terminal-activity">
        <summary
          className="ongoing-task"
          title={`${tr("runningSessions")}: ${count}`}
          aria-label={`${tr("runningSessions")}: ${count}`}
        >
          <Icon path={mdiConsole} size={18} />
          <span>{count}</span>
        </summary>
        <div className="profile-dropdown">
          <strong>
            {tr("runningSessions")}: {count}
          </strong>
          <Link
            to="/terminal"
            onClick={() => {
              if (menu.current) menu.current.open = false;
            }}
          >
            <Icon path={mdiConsole} size={18} />
            {tr("returnToTerminal")}
          </Link>
          <button
            onClick={() => {
              if (menu.current) menu.current.open = false;
              setConfirm(true);
            }}
          >
            <Icon path={mdiStop} size={18} />
            {tr("stopAll")}
          </button>
        </div>
      </details>
      <Dialog.Root open={confirm} onOpenChange={setConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            className="settings-dialog terminal-stop-dialog"
            header={
              <>
                {" "}
                <Dialog.Title>{tr("stopAll")}</Dialog.Title>
                <Dialog.Description>
                  {tr("stopAllWarning")}
                </Dialog.Description>{" "}
              </>
            }
            footer={
              <div className="dialog-actions">
                <Dialog.Close asChild>
                  <Button data-dialog-cancel>{tr("cancel")}</Button>
                </Dialog.Close>
                <Button
                  onClick={() => {
                    stopListeners.forEach((stop) => stop());
                    setConfirm(false);
                  }}
                >
                  {tr("stopAll")}
                </Button>
              </div>
            }
            variant="compact"
            intent="confirm"
            dirty={false}
          ></DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
function TerminalSession({ visible, id }: { visible: boolean; id: number }) {
  const host = useRef<HTMLDivElement>(null);
  const activate = useRef<(() => void) | null>(null);
  const [connection, setConnection] = useState("idle");
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({
      cursorBlink: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      screenReaderMode: true,
      scrollback: 2000,
      convertEol: false,
      fontSize: 14,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    const fitVisible = () => {
      if (host.current?.offsetWidth) fit.fit();
    };
    activate.current = () => {
      fitVisible();
      term.focus();
    };
    fitVisible();
    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/v1/terminal`,
    );
    socket.binaryType = "arraybuffer";
    setLive(id, true);
    setConnection("connecting");
    setStatus(tr("connecting_40b27edf"));
    const send = (v: unknown) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(v));
    };
    socket.onopen = () => {
      setConnection("connected");
      setStatus(tr("mounted_81e0cd16"));
      fitVisible();
      send({ type: "resize", rows: term.rows, cols: term.cols });
      if (host.current?.offsetWidth) term.focus();
    };
    socket.onmessage = (e) =>
      term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data));
    socket.onclose = () => {
      setLive(id, false);
      setConnection("closed");
      setStatus(tr("terminal_closed_c50ea89b"));
    };
    socket.onerror = () => {
      setConnection("error");
      setStatus(tr("connection_error_0e1c60a0"));
    };
    const input = term.onData((data) => send({ type: "input", data }));
    const resize = term.onResize((s) =>
      send({ type: "resize", rows: s.rows, cols: s.cols }),
    );
    const observer = new ResizeObserver(fitVisible);
    observer.observe(host.current);
    return () => {
      setLive(id, false);
      observer.disconnect();
      input.dispose();
      resize.dispose();
      activate.current = null;
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
      term.dispose();
    };
  }, [attempt]);
  useEffect(() => {
    if (visible) activate.current?.();
  }, [visible]);
  return (
    <section
      className="terminal-panel"
      hidden={!visible}
      role="tabpanel"
      id={`terminal-panel-${id}`}
      aria-labelledby={`terminal-tab-${id}`}
    >
      <div className="terminal-status-overlay">
        <span
          className={`terminal-connection terminal-connection-${connection}`}
          role="img"
          title={status}
          aria-label={status}
        >
          <Icon
            path={
              connection === "connected"
                ? mdiCheckCircleOutline
                : connection === "error"
                  ? mdiAlertCircleOutline
                  : connection === "closed"
                    ? mdiLanDisconnect
                    : mdiLoading
            }
          />
        </span>
        {["closed", "error"].includes(connection) && (
          <Button
            title={tr("reconnect")}
            aria-label={tr("reconnect")}
            onClick={() => setAttempt((v) => v + 1)}
          >
            <Icon path={mdiRefresh} />
          </Button>
        )}
      </div>
      <div ref={host} className="terminal-session-host" />
    </section>
  );
}
export function TerminalPage({ active = true }: { active?: boolean }) {
  const next = useRef(2);
  const [tabs, setTabs] = useState([1]);
  const [selected, setSelected] = useState(1);
  useEffect(() => {
    const stop = () => {
      setTabs([]);
      setSelected(0);
    };
    stopListeners.add(stop);
    return () => {
      stopListeners.delete(stop);
    };
  }, []);
  const add = () => {
    const id = next.current++;
    setTabs((v) => [...v, id]);
    setSelected(id);
  };
  const close = (id: number) => {
    const remaining = tabs.filter((v) => v !== id);
    setTabs(remaining);
    if (selected === id)
      setSelected(remaining[Math.max(0, tabs.indexOf(id) - 1)] ?? 0);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{tr("terminal_b7135883")}</h1>
          <p className="muted">
            {tr("your_system_user_s_shell_leaving_this_page_closes__e978a063")}
          </p>
        </div>
      </div>
      <div className="tabbed-page terminal-workspace">
        <div
          className="tabs terminal-tabs"
          role="tablist"
          aria-label={tr("terminal_b7135883")}
        >
          {tabs.map((id) => (
            <div
              className="terminal-tab"
              data-state={selected === id ? "active" : "inactive"}
              key={id}
            >
              <button
                data-state={selected === id ? "active" : "inactive"}
                role="tab"
                id={`terminal-tab-${id}`}
                aria-controls={`terminal-panel-${id}`}
                aria-selected={selected === id}
                tabIndex={selected === id ? 0 : -1}
                onClick={() => setSelected(id)}
                onKeyDown={(e) => {
                  const index = tabs.indexOf(id);
                  const target =
                    e.key === "ArrowRight"
                      ? tabs[(index + 1) % tabs.length]
                      : e.key === "ArrowLeft"
                        ? tabs[(index + tabs.length - 1) % tabs.length]
                        : e.key === "Home"
                          ? tabs[0]
                          : e.key === "End"
                            ? tabs.at(-1)
                            : undefined;
                  if (target !== undefined) {
                    e.preventDefault();
                    setSelected(target);
                    document.getElementById(`terminal-tab-${target}`)?.focus();
                  }
                }}
              >
                <Icon path={mdiConsole} />
                {tr("terminal_b7135883")} {id}
              </button>
              <Button
                title={tr("close_terminal_93e0366b")}
                aria-label={`${tr("close_terminal_93e0366b")} ${id}`}
                onClick={() => close(id)}
              >
                <Icon path={mdiClose} />
              </Button>
            </div>
          ))}
          <Button
            title={tr("open_terminal_6c5b2221")}
            aria-label={tr("open_terminal_6c5b2221")}
            onClick={add}
          >
            <Icon path={mdiPlus} />
          </Button>
        </div>
        {tabs.map((id) => (
          <TerminalSession
            key={id}
            id={id}
            visible={active && id === selected}
          />
        ))}
        {!tabs.length && (
          <div className="empty-state">
            <Button onClick={add}>
              <Icon path={mdiPlus} />
              {tr("open_terminal_6c5b2221")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
import { registerModule } from "@panasms/runtime";

const terminalModule = {
  id: "terminal",
  title: tr("terminal_b7135883"),
  path: "/terminal",
  icon: mdiConsole,
  component: TerminalPage,
  keepAlive: true,
  backgroundIndicator: TerminalIndicator,
};
registerModule(terminalModule);
