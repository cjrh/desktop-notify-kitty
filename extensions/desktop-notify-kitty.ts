import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { basename } from "node:path";

const APP_NAME = "pi";
const ICON = "utilities-terminal";
const EXPIRE_MS = "10000";
const MAX_BODY_CHARS = 500;

// XTerm-compatible focus reporting. Most modern terminal emulators support
// this. It tells pi when this terminal gains/loses keyboard focus.
const ENABLE_FOCUS_REPORTING = "\x1b[?1004h";
const DISABLE_FOCUS_REPORTING = "\x1b[?1004l";
const FOCUS_IN = "\x1b[I";
const FOCUS_OUT = "\x1b[O";

function textFromMessage(message: any): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "text" && typeof part.text === "string") return part.text;
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .join("")
    .trim();
}

function lastAssistantText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    const text = textFromMessage(message).replace(/\s+/g, " ").trim();
    if (!text) continue;
    return text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS - 1)}…` : text;
  }
  return "Done. Come back to this terminal session when ready.";
}

async function getKittyWindowFocused(pi: ExtensionAPI): Promise<boolean | undefined> {
  const kittyWindowId = Number(process.env.KITTY_WINDOW_ID);
  if (!Number.isFinite(kittyWindowId)) return undefined;

  try {
    const result = await pi.exec("kitty", ["@", "ls"], { timeout: 1000 });
    if (result.code !== 0 || !result.stdout.trim()) return undefined;

    const osWindows = JSON.parse(result.stdout) as any[];
    for (const osWindow of osWindows) {
      for (const tab of osWindow?.tabs ?? []) {
        for (const win of tab?.windows ?? []) {
          if (win?.id !== kittyWindowId) continue;

          // kitty reports focus at each level. If a future/older kitty omits a
          // field, fall back to the corresponding active flag where possible.
          const osFocused = osWindow.is_focused ?? osWindow.is_active;
          const tabFocused = tab.is_focused ?? tab.is_active;
          const winFocused = win.is_focused ?? win.is_active;
          return osFocused === true && tabFocused === true && winFocused === true;
        }
      }
    }
  } catch {
    // Fall through to terminal focus reporting.
  }

  return undefined;
}

async function sendDesktopNotification(
  pi: ExtensionAPI,
  title: string,
  body: string,
  urgency: "low" | "normal" | "critical" = "normal",
): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await pi.exec(
      "notify-send",
      [
        `--app-name=${APP_NAME}`,
        `--icon=${ICON}`,
        `--urgency=${urgency}`,
        `--expire-time=${EXPIRE_MS}`,
        title,
        body,
      ],
      { timeout: 3000 },
    );

    if (result.code === 0) return { ok: true };
    return { ok: false, error: (result.stderr || result.stdout || `exit code ${result.code}`).trim() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export default function (pi: ExtensionAPI) {
  // Start optimistic: when pi is launched/reloaded from a terminal, that terminal
  // is usually focused. If focus reporting is unsupported, this suppresses the
  // automatic notification rather than spamming while you are actively working.
  let terminalFocused = true;
  let focusReportingEnabled = false;
  let unsubscribeFocusTracking: (() => void) | undefined;

  function enableFocusTracking(ctx: { hasUI: boolean; ui: { onTerminalInput: (handler: (data: string) => { consume?: boolean; data?: string } | undefined) => () => void } }) {
    if (focusReportingEnabled || !ctx.hasUI || !process.stdout.isTTY) return;

    focusReportingEnabled = true;
    process.stdout.write(ENABLE_FOCUS_REPORTING);
    unsubscribeFocusTracking = ctx.ui.onTerminalInput((data) => {
      let rewritten = data;

      if (rewritten.includes(FOCUS_IN)) {
        terminalFocused = true;
        rewritten = rewritten.replaceAll(FOCUS_IN, "");
      }
      if (rewritten.includes(FOCUS_OUT)) {
        terminalFocused = false;
        rewritten = rewritten.replaceAll(FOCUS_OUT, "");
      }

      if (rewritten === data) return undefined;
      return rewritten.length === 0 ? { consume: true } : { data: rewritten };
    });
  }

  function disableFocusTracking() {
    unsubscribeFocusTracking?.();
    unsubscribeFocusTracking = undefined;
    if (focusReportingEnabled && process.stdout.isTTY) {
      process.stdout.write(DISABLE_FOCUS_REPORTING);
    }
    focusReportingEnabled = false;
  }

  pi.on("session_start", async (_event, ctx) => {
    enableFocusTracking(ctx);
  });

  pi.on("session_shutdown", async () => {
    disableFocusTracking();
  });

  pi.on("agent_end", async (event, ctx) => {
    // If steering/follow-up messages are queued, avoid summoning the user until
    // pi has drained the queue and is really idle.
    if (ctx.hasPendingMessages()) return;

    // Only summon the user when this terminal does not currently have focus.
    // In kitty, prefer kitty's own remote-control focus state. Otherwise fall
    // back to generic terminal focus reporting.
    const kittyFocused = await getKittyWindowFocused(pi);
    if (kittyFocused ?? terminalFocused) return;

    const project = basename(ctx.cwd) || ctx.cwd;
    const summary = lastAssistantText(event.messages as any[]);
    await sendDesktopNotification(pi, "Pi needs attention", `${project}: ${summary}`);
  });

  pi.registerCommand("desktop-notify-test", {
    description: "Send a test desktop notification using notify-send",
    handler: async (_args, ctx) => {
      const result = await sendDesktopNotification(
        pi,
        "Pi desktop notifications are working",
        `Test notification from ${basename(ctx.cwd) || ctx.cwd}.`,
      );
      if (result.ok) {
        ctx.ui.notify("Desktop notification sent.", "info");
      } else {
        ctx.ui.notify(`notify-send failed: ${result.error ?? "unknown error"}`, "error");
      }
    },
  });
}
