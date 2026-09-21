import { mdiConsole, mdiClose, mdiRefresh } from "@mdi/js";
import { tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Button, Icon, Notice } from "@panasms/ui";
export function TerminalPage() {
  const host = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [connection, setConnection] = useState("idle");
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!active || !host.current) return;
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
    fit.fit();
    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/v1/terminal`,
    );
    socket.binaryType = "arraybuffer";
    setConnection("connecting");
    setStatus(tr("connecting_40b27edf"));
    const send = (v: unknown) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(v));
    };
    socket.onopen = () => {
      setConnection("connected");
      setStatus(tr("mounted_81e0cd16"));
      fit.fit();
      send({ type: "resize", rows: term.rows, cols: term.cols });
      term.focus();
    };
    socket.onmessage = (e) =>
      term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data));
    socket.onclose = () => { setConnection("closed"); setStatus(tr("terminal_closed_c50ea89b")); };
    socket.onerror = () => { setConnection("error"); setStatus(tr("connection_error_0e1c60a0")); };
    const input = term.onData((data) => send({ type: "input", data }));
    const resize = term.onResize((s) =>
      send({ type: "resize", rows: s.rows, cols: s.cols }),
    );
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      input.dispose();
      resize.dispose();
      socket.close();
      term.dispose();
    };
  }, [active, attempt]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{tr("terminal_b7135883")}</h1>
          <p className="muted">
            {tr("your_system_user_s_shell_leaving_this_page_closes__e978a063")}
          </p>
        </div>
        <div className="actions">
          {active && ['closed','error'].includes(connection) && <Button title={tr('reconnect')} aria-label={tr('reconnect')} onClick={() => setAttempt(v => v + 1)}><Icon path={mdiRefresh} /></Button>}
          <Button title={tr(active ? 'close_terminal_93e0366b' : 'open_terminal_6c5b2221')} aria-label={tr(active ? 'close_terminal_93e0366b' : 'open_terminal_6c5b2221')} onClick={() => { setActive(!active); setStatus(''); }}><Icon path={active ? mdiClose : mdiConsole} /></Button>
        </div>
      </div>
      {status && <Notice>{status}</Notice>}
      {!active && <section className="surface empty-state"><Icon path={mdiConsole} size={40} /><h2>{tr("open_terminal_6c5b2221")}</h2><p className="muted">{tr("ready")}</p></section>}
      <div
        hidden={!active}
        ref={host}
        className="terminal-surface"
        style={{
          height: "65vh",
          minHeight: 300,
          padding: 14,
          background: "#000",
          borderRadius: 12,
        }}
      />
    </>
  );
}
import { registerModule } from "@panasms/runtime";

registerModule({
  id: "terminal",
  title: tr("terminal_b7135883"),
  path: "/terminal",
  icon: mdiConsole,
  component: TerminalPage,
});
