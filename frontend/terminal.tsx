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
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";
import { Button, Icon, DialogContent, SectionNav } from "@panasms/ui";
import * as Dialog from "@radix-ui/react-dialog";
import type { DialogContentProps as RadixDialogContentProps } from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
const liveSessions = new Set<number>();
const registeredSessions = new Set<number>();
const listeners = new Set<() => void>();
const stopListeners = new Set<(ids: number[]) => void>();
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
function registerSession(id: number, registered: boolean) {
  if (registered) registeredSessions.add(id);
  else registeredSessions.delete(id);
}
function closeSessions(ids: number[]) {
  stopListeners.forEach((stop) => stop(ids));
}
function openTerminalControl() {
  return (
    Array.from(
      document.querySelectorAll<HTMLElement>("[data-terminal-open]"),
    ).find(
      (button) => button.getClientRects().length && !button.closest("[inert]"),
    ) ?? null
  );
}
function TerminalCloseDialog({
  ids,
  open,
  onOpenChange,
  returnFocus,
}: {
  ids: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus?: () => HTMLElement | null;
}) {
  if (!ids.length) return null;
  const target = ids.map((id) => `${tr("terminal_b7135883")} ${id}`).join(", ");
  const single = ids.length === 1;
  const title = single
    ? tr("terminalCloseTitle", { id: ids[0] })
    : tr("stopAll");
  const accept = single
    ? tr("terminalCloseTitle", { id: ids[0] })
    : tr("terminalCloseSelected", { ids: ids.join(", ") });
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent
          className="settings-dialog terminal-stop-dialog"
          onCloseAutoFocus={(
            event: Parameters<
              NonNullable<RadixDialogContentProps["onCloseAutoFocus"]>
            >[0],
          ) => {
            if (!returnFocus) return;
            event.preventDefault();
            const target = returnFocus();
            if (
              target?.isConnected &&
              target.getClientRects().length &&
              !target.closest("[inert]")
            )
              target.focus({ preventScroll: true });
          }}
          header={<Dialog.Title>{title}</Dialog.Title>}
          footer={
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button data-dialog-cancel>{tr("cancel")}</Button>
              </Dialog.Close>
              <Button
                className="danger"
                onClick={() => {
                  closeSessions(ids);
                  onOpenChange(false);
                }}
              >
                {accept}
              </Button>
            </div>
          }
          variant="compact"
          intent="confirm"
          dirty={false}
        >
          <Dialog.Description asChild>
            <div className="terminal-close-confirmation">
              <p>
                {single
                  ? tr("terminalCloseWarning", { terminal: target })
                  : tr("terminalCloseAllWarning")}
              </p>
              <p>
                <strong>{target}</strong>
              </p>
            </div>
          </Dialog.Description>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function TerminalIndicator() {
  const count = useSyncExternalStore(subscribe, snapshot);
  const menu = useRef<HTMLDetailsElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [confirmIds, setConfirmIds] = useState<number[]>([]);
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
  if (!count && !confirm) return null;
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
              setConfirmIds([...registeredSessions]);
              setConfirm(true);
            }}
          >
            <Icon path={mdiStop} size={18} />
            {tr("stopAll")}
          </button>
        </div>
      </details>
      <TerminalCloseDialog
        ids={confirmIds}
        open={confirm}
        onOpenChange={setConfirm}
        returnFocus={() => {
          const summary = menu.current?.querySelector("summary");
          return summary?.isConnected && summary.getClientRects().length
            ? summary
            : openTerminalControl();
        }}
      />
    </>
  );
}
function TerminalSession({
  visible,
  id,
  onClose,
}: {
  visible: boolean;
  id: number;
  onClose: (trigger: HTMLButtonElement) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const activate = useRef<(() => void) | null>(null);
  const [connection, setConnection] = useState("idle");
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!host.current) return;
    Terminal.strings.promptLabel = tr("terminalInput");
    Terminal.strings.tooMuchOutput = tr("tooMuchOutput");
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
    const translateInput = () => {
      Terminal.strings.promptLabel = tr("terminalInput");
      Terminal.strings.tooMuchOutput = tr("tooMuchOutput");
      term.textarea?.setAttribute("aria-label", tr("terminalInput"));
    };
    const languageObserver = new MutationObserver(translateInput);
    languageObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
    translateInput();
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
    registerSession(id, true);
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
      registerSession(id, false);
      observer.disconnect();
      input.dispose();
      resize.dispose();
      activate.current = null;
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      if (socket.readyState < WebSocket.CLOSING) socket.close();
      languageObserver.disconnect();
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
      role="region"
      id={`terminal-panel-${id}`}
      aria-label={`${tr("terminal_b7135883")} ${id}`}
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
        <Button
          title={tr("terminalCloseTitle", { id })}
          aria-label={tr("terminalCloseTitle", { id })}
          onClick={(event: MouseEvent<HTMLButtonElement>) =>
            onClose(event.currentTarget)
          }
        >
          <Icon path={mdiClose} />
        </Button>
      </div>
      <div ref={host} className="terminal-session-host" />
    </section>
  );
}
export function TerminalPage({ active = true }: { active?: boolean }) {
  const next = useRef(2);
  const [tabs, setTabs] = useState([1]);
  const [selected, setSelected] = useState(1);
  const [confirmIds, setConfirmIds] = useState<number[]>([]);
  const [confirm, setConfirm] = useState(false);
  const closeTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const stop = (ids: number[]) => {
      const closing = new Set(ids);
      const remaining = tabs.filter((id) => !closing.has(id));
      setTabs(remaining);
      if (closing.has(selected))
        setSelected(remaining[Math.max(0, tabs.indexOf(selected) - 1)] ?? 0);
    };
    stopListeners.add(stop);
    return () => {
      stopListeners.delete(stop);
    };
  }, [tabs, selected]);
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
  const requestClose = (id: number, trigger: HTMLButtonElement) => {
    closeTrigger.current = trigger;
    if (liveSessions.has(id)) {
      setConfirmIds([id]);
      setConfirm(true);
    } else close(id);
  };
  return (
    <>
      <TerminalCloseDialog
        ids={confirmIds}
        open={confirm}
        onOpenChange={setConfirm}
        returnFocus={() => {
          const trigger = closeTrigger.current;
          return trigger?.isConnected && trigger.getClientRects().length
            ? trigger
            : openTerminalControl();
        }}
      />
      <div className="page-heading">
        <div>
          <h1>{tr("terminal_b7135883")}</h1>
          <p className="muted">
            {tr("your_system_user_s_shell_leaving_this_page_closes__e978a063")}
          </p>
        </div>
      </div>
      <div className="section-layout terminal-workspace">
        <SectionNav
          label={tr("terminal_b7135883")}
          tabs={false}
          value={String(selected)}
          onChange={(id) => setSelected(Number(id))}
          items={tabs.map((id) => ({
            id: String(id),
            title: `${tr("terminal_b7135883")} ${id}`,
            icon: mdiConsole,
          }))}
          footer={
            <Button data-terminal-open onClick={add}>
              <Icon path={mdiPlus} />
              {tr("open_terminal_6c5b2221")}
            </Button>
          }
        />
        {tabs.map((id) => (
          <TerminalSession
            key={id}
            id={id}
            visible={active && id === selected}
            onClose={(trigger) => requestClose(id, trigger)}
          />
        ))}
        {!tabs.length && (
          <div className="empty-state">
            <Button data-terminal-open onClick={add}>
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
