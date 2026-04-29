# desktop-notify-kitty

A [pi](https://pi.dev) extension that sends a Linux desktop notification when pi finishes an agent run and the kitty terminal window running pi is not focused.

It uses:

- `kitten notify` for desktop notifications in kitty (clicking the notification jumps back to the originating window)
- `notify-send` as a fallback for non-kitty terminals
- `kitty @ ls --self` + `KITTY_WINDOW_ID` for kitty-specific focus detection
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

The notification includes the current project directory name and a short, truncated excerpt from the last assistant answer. Thinking/reasoning blocks, tool calls, images, and unknown content blocks are ignored.

## Requirements

- Linux desktop notification service
- kitty terminal: `kitten notify` is used automatically (kitty ≥ 0.36.0)
- Non-kitty terminals: `notify-send` on `PATH` (fallback)
- kitty remote control must be available for `kitty @ ls` (focus detection)

If kitty focus detection is unavailable, the extension falls back to generic terminal focus reporting.

## Notes

This detects whether the terminal is focused, not whether it is merely visible on screen. On Wayland, reliable cross-compositor window visibility detection is generally not available to terminal applications.

If you already have a local copy of this extension in `~/.pi/agent/extensions/`, remove or disable that copy before installing this package to avoid duplicate notifications.
