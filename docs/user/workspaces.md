# Split workspaces

On web and desktop, a workspace shows several threads side by side. It is a named
layout of split panes, each pane holding tabs of threads from any project or
environment. Phones keep the single thread view.

## Start a workspace

Open a thread, then press `Cmd+D` to split the pane to the right. The new pane
starts a draft in the same project. Use the split buttons at the end of a pane's
tab bar to split it down. `Cmd+T` adds a tab to the focused pane and `Cmd+N`
opens a new workspace named after the focused thread's project.

The sidebar lists your workspaces with each tab's status and pull requests.
Choose a workspace to switch to it, or a tab line to jump to that thread.
Double-click a name, or press `Cmd+Shift+R`, to rename the workspace. Closing a
workspace offers **Undo**; its threads stay in **All threads** either way.

See [Keybindings](./keybindings.md#split-workspace) for every pane, tab and
workspace shortcut.

## Good to know

- A thread is open in one place at a time. Opening it again, from the sidebar,
  the palette or a link, jumps to the pane that already shows it.
- A project keeps one empty draft. Starting a new thread for a project whose
  empty draft is already open focuses that draft; a new workspace takes it with
  it.
- An empty pane closes with `Cmd+W` or its **Close pane** button. The last pane
  stays open.
- When the window is too narrow for the layout, only the focused pane shows.
  Widen the window to get the panes back.
- Workspaces are saved on this device, per browser profile on the web. They do
  not follow you to other devices.
- **All threads** at the bottom of the sidebar shows the classic thread list,
  with pins, snoozing and settling; **Workspaces** at its bottom switches back.
  T3 Code remembers your choice on this device.
