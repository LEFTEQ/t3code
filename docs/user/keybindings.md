# Keybindings

Customize shortcuts in **Settings → Keybindings** on web and desktop. That page
also lists the command IDs and defaults available in your version.

## Split workspace

The defaults follow cmux. They work while a workspace is open; the command
palette lists the same actions.

| Action                                                 | macOS desktop                                       | Browser tab             |
| ------------------------------------------------------ | --------------------------------------------------- | ----------------------- |
| Split pane right                                       | `Cmd+D`                                             | same                    |
| Focus pane left / right / up / down                    | `Option+Shift+Arrow`                                | same                    |
| Previous / next tab                                    | `Cmd+Shift+Left` / `Right`                          | same                    |
| Previous / next workspace                              | `Cmd+Shift+Up` / `Down`                             | same                    |
| New thread tab / close tab                             | `Cmd+T` / `Cmd+W`                                   | `Option+T` / `Option+W` |
| Reopen closed tab / close other tabs                   | `Cmd+Shift+T` / `Option+Cmd+T`                      | `Option+Shift+T` / same |
| Select tab 1–8 / last                                  | `Ctrl+1`…`8` / `Ctrl+9`                             | same                    |
| New workspace                                          | `Cmd+N`                                             | `Option+N`              |
| Select workspace 1–8 / last                            | `Cmd+1`…`8` / `Cmd+9`                               | —                       |
| Switch workspace                                       | `Cmd+P`                                             | same                    |
| Zoom pane                                              | `Option+Shift+Return`                               | same                    |
| Resize pane / equalize                                 | `Ctrl+Shift+H/J/K/L` / `Ctrl+Cmd+Shift+=`           | same                    |
| Move tab to pane / reorder tab                         | `Option+Cmd+Shift+Arrow` / `Option+Cmd+Shift+[` `]` | same                    |
| Rename tab / workspace                                 | `Cmd+R` / `Cmd+Shift+R`                             | same                    |
| Jump to the agent waiting on you / list waiting agents | `Cmd+Shift+U` / `Cmd+I`                             | same                    |

Pane, tab and workspace arrows take priority over text selection in the
composer. Splitting down has no default shortcut; use the pane's split button or
the palette. The command palette opens with `Cmd+K` or `Cmd+Shift+P`, the file
picker with `Option+Cmd+P`, the diff with `Cmd+Shift+D`, and the right panel
toggles with `Cmd+Shift+E`.

The Control-based shortcuts are macOS-only, because Control is `mod` on Windows
and Linux. There, use the palette or bind those commands in Settings.

## Composer controls

In **Settings → General → Send shortcut**, choose whether Enter sends, requires
`mod+Enter` for multiline prompts, or always requires `mod+Enter`. `Shift+Enter`
inserts a new line. This applies to the web and desktop composer at desktop widths.

**Follow-up behavior** chooses Queue or Steer while the agent runs. Use
`mod+Enter` to do the opposite for one message. When sending requires `mod+Enter`,
use `mod+Shift+Enter` for the opposite action. In a new thread, `mod+Enter` keeps
starting the thread in the background.

Use `mod+shift+m` to choose a model and `mod+shift+h` to choose a host.
Use `mod+alt+e` for effort, `mod+shift+a` for access mode, `mod+shift+x` for the
workspace, and `mod+shift+g` for the Git branch. The workspace menu includes the
current checkout, a new worktree, and the previous worktree when available.
Use `mod+shift+l` to reuse the previous worktree directly.

In the model picker, press Left in an empty search field or Shift+Tab to reach
the provider list. Use Up/Down to move and Enter to choose. Right returns to
model search. `mod+shift+up` and `mod+shift+down` switch providers directly and clear the
search. These provider shortcuts can also be changed in Settings.

These shortcuts run inside the focused web or desktop client. `mod` uses Command
on macOS and Ctrl on Windows and Linux, including GNOME, KDE Plasma, Niri, and
Hyprland. If a custom desktop shortcut takes the same keys, choose another binding
in Settings.

## Chat density

On macOS, `ctrl+mod+=` makes the chat roomier, `ctrl+mod+-` denser, and `ctrl+mod+0` returns
to Compact at 100% text size. Elsewhere, use **Cycle chat density** or **Chat density** in the
command palette, or bind the `chat.density.roomier`, `chat.density.denser`, and
`chat.density.reset` commands.

## Copy pull request references

With a PR open in the right panel or on the Pull Requests page, use `mod+shift+c`
to copy its URL and `mod+shift+k` to copy its number with a `#` prefix.
Both shortcuts can be changed in Settings. Search for “Copy Link or Thread ID”
or “Copy Number”. They copy the selected PR and leave terminal input alone.

## iPad

With a hardware keyboard, use `Cmd+1` through `Cmd+9` to open the first nine
displayed threads. The shortcuts follow the current list filters and order.
`Cmd+K` opens the command palette to search commands, projects, and threads.
Use the arrow keys and Return to choose a result, or `Cmd+1` through `Cmd+9` to
choose directly. Escape or `Cmd+K` closes the palette. Start a search with `>`
to show only actions.

In the composer, Return sends and `Shift+Return` inserts a new line. `Cmd+Return`
also sends. To make Return insert a new line instead, change the Return key
behavior in Settings → Keyboard.

## Edit the configuration file

Keybindings live on the environment's machine, in
`~/.t3/userdata/keybindings.json` by default. You can edit this file directly.
It is a JSON array of rules:

```json
[
  { "key": "mod+g", "command": "terminal.toggle" },
  { "key": "mod+shift+g", "command": "terminal.new", "when": "terminalFocus" }
]
```

T3 Code creates the file with its defaults and adds new defaults on later startups.
New defaults do not replace commands you customized. If a new default overlaps one
of your shortcuts, [rule order](#precedence) decides which runs.
Invalid rules are ignored; if the file cannot be parsed, T3 Code uses defaults.

## Rule shape

Each rule requires a `key` shortcut and a `command` ID. An optional `when`
expression restricts when it runs.

Project scripts use `script.{id}.run`, such as `script.test.run`.

## Key syntax

Join modifiers and a key with `+`, such as `mod+shift+d` or `ctrl+l`.
`mod` means Command on macOS and Control elsewhere. Other modifiers are
`cmd` / `meta`, `ctrl` / `control`, `alt` / `option`, and `shift`.

## When conditions

Available context keys are `terminalFocus`, `terminalOpen`, `previewFocus`,
`previewOpen`, `modelPickerOpen`, `usagePageOpen`, `editableFocus`, `workspaceOpen`,
`isWeb`, `isDesktop`, and `isMac`.
`editableFocus` is true while a text field, the composer, or another editor has
the keyboard. `workspaceOpen` is true while a split workspace is open. `isWeb` is
true in a browser tab. `isDesktop` is true in the desktop app. Unknown keys
evaluate to `false`.

`mod+1` through `mod+9` select workspaces, and models while the model picker is
open. Those defaults use `isDesktop` so they do not steal the browser's
tab-switch shortcuts. Remove that condition in Settings if you want the same
jumps in a browser. Jumping to sidebar threads (`thread.jump.1`…`9`) has no
default shortcut.

Combine keys with `!` for not, `&&` for and, `||` for or, and parentheses:

```json
{ "key": "mod+j", "command": "terminal.toggle", "when": "terminalOpen && !terminalFocus" }
```

## Precedence

The last rule whose key and condition both match wins, even if it belongs to a
different command. Put a more specific rule after a general one when they share
a shortcut.

## Commands with special behavior

`thread.stop` interrupts the running turn in the focused thread. It has no default
shortcut; assign one in **Settings → Keybindings**.

`thread.undo` (`mod+z` by default) reverses the actions shown in the notice at the
bottom of the sidebar, such as unpin, settle, snooze, or archive. Consecutive
actions of the same kind undo together. The notice remains available for five
seconds after the latest action. The default shortcut skips text fields and
terminals so native undo keeps working there.

`navigation.back` (`mod+[` by default) and `navigation.forward` (`mod+]`) move
through the pages you have visited, like a browser's back and forward buttons.

`chat.new` may ask you to choose a project when there is more than one.
`chat.newLocal` skips that chooser. Both use your
[new-thread defaults](./thread-sidebar.md#start-a-thread).

## Reserved shortcuts

In the desktop app, `mod+w` closes the focused workspace tab, or the focused
terminal or right-panel tab while one of those has the keyboard. On macOS it never
closes the window; use `Ctrl+Cmd+W` for that. In a browser, Chrome keeps
`mod+t`, `mod+w`, `mod+shift+t`, and `mod+n` for itself, so the workspace uses
`alt+t`, `alt+w`, `alt+shift+t`, and `alt+n` there. Those work while you are not typing in a text
field, since `alt` with a letter enters characters on macOS.

Many defaults include `!terminalFocus` so they do not intercept terminal input.
Keep that condition when remapping them if you want the same behavior.

## Desktop quit shortcut

Use `Cmd+Q` on macOS or `Ctrl+Q` on Windows and Linux. In the default **Hold** mode,
hold for 1.2 seconds or press twice within 500 milliseconds. Holding requires
keyboard repeat; if repeat is disabled, use two presses or the application menu.

Change **Settings → General → Confirmations → Quit shortcut** to **Direct** for a
single press or **Double press** for two presses only. Choosing **Quit** from the
application menu always quits immediately.
