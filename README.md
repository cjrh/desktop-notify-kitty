# desktop-notify-kitty

A [pi](https://pi.dev) extension that sends a Linux desktop notification when pi finishes an agent run and the kitty terminal window running pi is not focused.

It uses:

- `notify-send` for desktop notifications
- `kitty @ ls` + `KITTY_WINDOW_ID` for kitty-specific focus detection
- xterm focus reporting as a fallback for non-kitty terminals

## Install

From npm:

```bash
pi install npm:desktop-notify-kitty
```

Or from GitHub:

```bash
pi install git:github.com/cjrh/desktop-notify-kitty
```

Reload any already-running pi session:

```text
/reload
```

## Test

Inside pi:

```text
/desktop-notify-test
```

## Behavior

The extension listens for pi's `agent_end` lifecycle event. When pi completes a response, it sends a notification only if the current terminal does not appear focused.

The notification includes the current project directory name and a short excerpt from the last assistant message.

## Requirements

- Linux desktop notification service
- `notify-send` on `PATH`
- kitty terminal for best focus detection
- kitty remote control must be available for `kitty @ ls`

If kitty focus detection is unavailable, the extension falls back to generic terminal focus reporting.

## Notes

This detects whether the terminal is focused, not whether it is merely visible on screen. On Wayland, reliable cross-compositor window visibility detection is generally not available to terminal applications.

If you already have a local copy of this extension in `~/.pi/agent/extensions/`, remove or disable that copy before installing this package to avoid duplicate notifications.
