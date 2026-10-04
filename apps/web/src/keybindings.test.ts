import { assert, describe, it } from "vite-plus/test";
import {
  compileResolvedKeybindingsConfig,
  DEFAULT_RESOLVED_KEYBINDINGS,
  mergeWithDefaultKeybindings,
} from "@t3tools/shared/keybindings";

import {
  type KeybindingCommand,
  type KeybindingShortcut,
  type KeybindingWhenNode,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import {
  formatShortcutLabel,
  isDiffToggleShortcut,
  isRichTextBoldShortcut,
  modelPickerJumpCommandForIndex,
  modelPickerJumpIndexFromCommand,
  isOpenFavoriteEditorShortcut,
  isTerminalClearShortcut,
  isTerminalCloseShortcut,
  isTerminalNewShortcut,
  isTerminalSplitShortcut,
  isTerminalSplitVerticalShortcut,
  isTerminalToggleShortcut,
  resolveShortcutCommand,
  shouldShowThreadJumpHintsForModifiers,
  shortcutLabelForCommand,
  terminalDeleteShortcutData,
  terminalNavigationShortcutData,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
  type ShortcutEventLike,
} from "./keybindings";

function event(overrides: Partial<ShortcutEventLike> = {}): ShortcutEventLike {
  return {
    key: "j",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

function modShortcut(
  key: string,
  overrides: Partial<Omit<KeybindingShortcut, "key">> = {},
): KeybindingShortcut {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    modKey: true,
    ...overrides,
  };
}

function whenIdentifier(name: string): KeybindingWhenNode {
  return { type: "identifier", name };
}

function whenNot(node: KeybindingWhenNode): KeybindingWhenNode {
  return { type: "not", node };
}

function whenAnd(left: KeybindingWhenNode, right: KeybindingWhenNode): KeybindingWhenNode {
  return { type: "and", left, right };
}

interface TestBinding {
  shortcut: KeybindingShortcut;
  command: KeybindingCommand;
  whenAst?: KeybindingWhenNode;
}

function compile(bindings: TestBinding[]): ResolvedKeybindingsConfig {
  return bindings.map((binding) => ({
    command: binding.command,
    shortcut: binding.shortcut,
    ...(binding.whenAst ? { whenAst: binding.whenAst } : {}),
  }));
}

const DEFAULT_BINDINGS = compile([
  { shortcut: modShortcut("b"), command: "sidebar.toggle" },
  { shortcut: modShortcut("j"), command: "terminal.toggle" },
  { shortcut: modShortcut("b", { altKey: true }), command: "rightPanel.toggle" },
  {
    shortcut: modShortcut("d"),
    command: "terminal.split",
    whenAst: whenIdentifier("terminalFocus"),
  },
  {
    shortcut: modShortcut("d", { shiftKey: true }),
    command: "terminal.splitVertical",
    whenAst: whenIdentifier("terminalFocus"),
  },
  {
    shortcut: modShortcut("n"),
    command: "terminal.new",
    whenAst: whenIdentifier("terminalFocus"),
  },
  {
    shortcut: modShortcut("w"),
    command: "terminal.close",
    whenAst: whenIdentifier("terminalFocus"),
  },
  {
    shortcut: modShortcut("w"),
    command: "rightPanel.close",
    whenAst: whenNot(whenIdentifier("terminalFocus")),
  },
  {
    shortcut: modShortcut("d"),
    command: "diff.toggle",
    whenAst: whenNot(whenIdentifier("terminalFocus")),
  },
  {
    shortcut: modShortcut("k"),
    command: "commandPalette.toggle",
    whenAst: whenNot(whenIdentifier("terminalFocus")),
  },
  {
    shortcut: modShortcut("p"),
    command: "filePicker.toggle",
    whenAst: whenNot(whenIdentifier("terminalFocus")),
  },
  {
    shortcut: modShortcut("f", { shiftKey: true }),
    command: "projectSearch.toggle",
    whenAst: whenNot(whenIdentifier("terminalFocus")),
  },
  {
    shortcut: modShortcut("t", { altKey: true, shiftKey: true }),
    command: "themeEditor.toggle",
  },
  {
    shortcut: modShortcut("m", { shiftKey: true }),
    command: "modelPicker.toggle",
    whenAst: whenNot(whenIdentifier("terminalFocus")),
  },
  { shortcut: modShortcut("o", { shiftKey: true }), command: "chat.new" },
  { shortcut: modShortcut("n", { shiftKey: true }), command: "chat.newLocal" },
  { shortcut: modShortcut("o"), command: "editor.openFavorite" },
  { shortcut: modShortcut("[", { shiftKey: true }), command: "thread.previous" },
  { shortcut: modShortcut("]", { shiftKey: true }), command: "thread.next" },
  {
    shortcut: modShortcut("c", { shiftKey: true }),
    command: "thread.copyReference",
    whenAst: whenNot(whenIdentifier("terminalFocus")),
  },
  {
    shortcut: modShortcut("s", { shiftKey: true }),
    command: "thread.settle",
    whenAst: whenNot(whenIdentifier("terminalFocus")),
  },
  { shortcut: modShortcut("1"), command: "thread.jump.1" },
  { shortcut: modShortcut("2"), command: "thread.jump.2" },
  { shortcut: modShortcut("3"), command: "thread.jump.3" },
  {
    shortcut: modShortcut("1"),
    command: "modelPicker.jump.1",
    whenAst: whenIdentifier("modelPickerOpen"),
  },
  {
    shortcut: modShortcut("2"),
    command: "modelPicker.jump.2",
    whenAst: whenIdentifier("modelPickerOpen"),
  },
  {
    shortcut: modShortcut("3"),
    command: "modelPicker.jump.3",
    whenAst: whenIdentifier("modelPickerOpen"),
  },
]);

describe("isTerminalToggleShortcut", () => {
  it("matches Cmd+J on macOS", () => {
    assert.isTrue(
      isTerminalToggleShortcut(event({ metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
      }),
    );
  });

  it("matches Ctrl+J on non-macOS", () => {
    assert.isTrue(
      isTerminalToggleShortcut(event({ ctrlKey: true }), DEFAULT_BINDINGS, { platform: "Win32" }),
    );
  });

  it("matches Ctrl+J on non-macOS while terminalFocus is true", () => {
    assert.isTrue(
      isTerminalToggleShortcut(event({ ctrlKey: true }), DEFAULT_BINDINGS, {
        platform: "Win32",
        context: { terminalFocus: true },
      }),
    );
  });
});

describe("settle thread shortcut", () => {
  it("resolves outside the terminal", () => {
    assert.equal(
      resolveShortcutCommand(event({ key: "s", metaKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
      "thread.settle",
    );
  });

  it("does not intercept the terminal", () => {
    assert.isNull(
      resolveShortcutCommand(event({ key: "s", ctrlKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "Win32",
        context: { terminalFocus: true },
      }),
    );
  });
});

describe("thread undo shortcut", () => {
  it("resolves mod+z with nothing editable focused", () => {
    assert.equal(
      resolveShortcutCommand(event({ key: "z", metaKey: true }), DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: false, editableFocus: false },
      }),
      "thread.undo",
    );
  });

  it("leaves native undo alone inside text fields and terminals", () => {
    assert.isNull(
      resolveShortcutCommand(event({ key: "z", ctrlKey: true }), DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "Win32",
        context: { editableFocus: true },
      }),
    );
    assert.isNull(
      resolveShortcutCommand(event({ key: "z", ctrlKey: true }), DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "Win32",
        context: { terminalFocus: true },
      }),
    );
  });
});

describe("copy thread reference shortcut", () => {
  it("resolves Cmd+Shift+C on macOS and Ctrl+Shift+C elsewhere", () => {
    assert.equal(
      resolveShortcutCommand(event({ key: "c", metaKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
      }),
      "thread.copyReference",
    );
    assert.equal(
      resolveShortcutCommand(event({ key: "c", ctrlKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
      }),
      "thread.copyReference",
    );
  });

  it("leaves terminal copy untouched", () => {
    assert.isNull(
      resolveShortcutCommand(event({ key: "c", ctrlKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
        context: { terminalFocus: true },
      }),
    );
  });
});

describe("split/new/close terminal shortcuts", () => {
  it("requires terminalFocus for default split/new/close bindings", () => {
    assert.isFalse(
      isTerminalSplitShortcut(event({ key: "d", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
    );
    assert.isFalse(
      isTerminalSplitVerticalShortcut(
        event({ key: "d", metaKey: true, shiftKey: true }),
        DEFAULT_BINDINGS,
        {
          platform: "MacIntel",
          context: { terminalFocus: false },
        },
      ),
    );
    assert.isFalse(
      isTerminalNewShortcut(event({ key: "n", ctrlKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
        context: { terminalFocus: false },
      }),
    );
    assert.isFalse(
      isTerminalCloseShortcut(event({ key: "w", ctrlKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
        context: { terminalFocus: false },
      }),
    );
  });

  it("matches split/new when terminalFocus is true", () => {
    assert.isTrue(
      isTerminalSplitShortcut(event({ key: "d", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
    );
    assert.isTrue(
      isTerminalSplitVerticalShortcut(
        event({ key: "d", metaKey: true, shiftKey: true }),
        DEFAULT_BINDINGS,
        {
          platform: "MacIntel",
          context: { terminalFocus: true },
        },
      ),
    );
    assert.isTrue(
      isTerminalNewShortcut(event({ key: "n", ctrlKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
        context: { terminalFocus: true },
      }),
    );
    assert.isTrue(
      isTerminalCloseShortcut(event({ key: "w", ctrlKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
        context: { terminalFocus: true },
      }),
    );
  });

  it("supports when expressions", () => {
    const keybindings = compile([
      {
        shortcut: modShortcut("\\"),
        command: "terminal.split",
        whenAst: whenAnd(whenIdentifier("terminalOpen"), whenNot(whenIdentifier("terminalFocus"))),
      },
      {
        shortcut: modShortcut("n", { shiftKey: true }),
        command: "terminal.new",
        whenAst: whenAnd(whenIdentifier("terminalOpen"), whenNot(whenIdentifier("terminalFocus"))),
      },
      { shortcut: modShortcut("j"), command: "terminal.toggle" },
    ]);
    assert.isTrue(
      isTerminalSplitShortcut(event({ key: "\\", ctrlKey: true }), keybindings, {
        platform: "Win32",
        context: { terminalOpen: true, terminalFocus: false },
      }),
    );
    assert.isFalse(
      isTerminalSplitShortcut(event({ key: "\\", ctrlKey: true }), keybindings, {
        platform: "Win32",
        context: { terminalOpen: false, terminalFocus: false },
      }),
    );
    assert.isTrue(
      isTerminalNewShortcut(event({ key: "n", ctrlKey: true, shiftKey: true }), keybindings, {
        platform: "Win32",
        context: { terminalOpen: true, terminalFocus: false },
      }),
    );
  });

  it("supports when boolean literals", () => {
    const keybindings = compile([
      { shortcut: modShortcut("n"), command: "terminal.new", whenAst: whenIdentifier("true") },
      { shortcut: modShortcut("m"), command: "terminal.new", whenAst: whenIdentifier("false") },
    ]);

    assert.isTrue(
      isTerminalNewShortcut(event({ key: "n", ctrlKey: true }), keybindings, {
        platform: "Linux",
      }),
    );
    assert.isFalse(
      isTerminalNewShortcut(event({ key: "m", ctrlKey: true }), keybindings, {
        platform: "Linux",
      }),
    );
  });
});

describe("shortcutLabelForCommand", () => {
  it("returns the effective binding label", () => {
    const bindings = compile([
      {
        shortcut: modShortcut("\\"),
        command: "terminal.split",
        whenAst: whenIdentifier("terminalFocus"),
      },
      {
        shortcut: modShortcut("\\", { shiftKey: true }),
        command: "terminal.split",
        whenAst: whenNot(whenIdentifier("terminalFocus")),
      },
    ]);
    assert.strictEqual(
      shortcutLabelForCommand(bindings, "terminal.split", {
        platform: "Linux",
        context: { terminalFocus: false },
      }),
      "Ctrl+Shift+\\",
    );
  });

  it("returns effective labels for non-terminal commands", () => {
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_BINDINGS, "sidebar.toggle", "MacIntel"),
      "⌘B",
    );
    assert.strictEqual(shortcutLabelForCommand(DEFAULT_BINDINGS, "chat.new", "MacIntel"), "⇧⌘O");
    assert.strictEqual(shortcutLabelForCommand(DEFAULT_BINDINGS, "diff.toggle", "Linux"), "Ctrl+D");
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_BINDINGS, "rightPanel.toggle", "MacIntel"),
      "⌥⌘B",
    );
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_BINDINGS, "commandPalette.toggle", "MacIntel"),
      "⌘K",
    );
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_BINDINGS, "filePicker.toggle", "MacIntel"),
      "⌘P",
    );
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_BINDINGS, "projectSearch.toggle", "MacIntel"),
      "⇧⌘F",
    );
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_BINDINGS, "modelPicker.toggle", "Linux"),
      "Ctrl+Shift+M",
    );
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_BINDINGS, "editor.openFavorite", "Linux"),
      "Ctrl+O",
    );
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_BINDINGS, "thread.jump.3", "MacIntel"),
      "⌘3",
    );
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_BINDINGS, "thread.previous", "Linux"),
      "Ctrl+Shift+[",
    );
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_BINDINGS, "modelPicker.jump.3", {
        platform: "MacIntel",
        context: { modelPickerOpen: true },
      }),
      "⌘3",
    );
  });

  it("returns null for commands shadowed by a later conflicting shortcut", () => {
    const bindings = compile([
      { shortcut: modShortcut("1", { shiftKey: true }), command: "thread.jump.1" },
      { shortcut: modShortcut("1", { shiftKey: true }), command: "thread.jump.7" },
    ]);

    assert.isNull(shortcutLabelForCommand(bindings, "thread.jump.1", "MacIntel"));
    assert.strictEqual(shortcutLabelForCommand(bindings, "thread.jump.7", "MacIntel"), "⇧⌘1");
  });

  it("respects when-context while resolving labels", () => {
    const bindings = compile([
      { shortcut: modShortcut("d"), command: "diff.toggle" },
      {
        shortcut: modShortcut("d"),
        command: "terminal.split",
        whenAst: whenIdentifier("terminalFocus"),
      },
    ]);

    assert.strictEqual(
      shortcutLabelForCommand(bindings, "diff.toggle", {
        platform: "Linux",
        context: { terminalFocus: false },
      }),
      "Ctrl+D",
    );
    assert.isNull(
      shortcutLabelForCommand(bindings, "diff.toggle", {
        platform: "Linux",
        context: { terminalFocus: true },
      }),
    );
    assert.strictEqual(
      shortcutLabelForCommand(bindings, "terminal.split", {
        platform: "Linux",
        context: { terminalFocus: true },
      }),
      "Ctrl+D",
    );
  });
});

describe("thread navigation helpers", () => {
  it("maps jump commands to visible thread indices", () => {
    assert.strictEqual(threadJumpCommandForIndex(0), "thread.jump.1");
    assert.strictEqual(threadJumpCommandForIndex(2), "thread.jump.3");
    assert.isNull(threadJumpCommandForIndex(9));
    assert.strictEqual(threadJumpIndexFromCommand("thread.jump.1"), 0);
    assert.strictEqual(threadJumpIndexFromCommand("thread.jump.3"), 2);
    assert.isNull(threadJumpIndexFromCommand("thread.next"));
  });

  it("maps traversal commands to directions", () => {
    assert.strictEqual(threadTraversalDirectionFromCommand("thread.previous"), "previous");
    assert.strictEqual(threadTraversalDirectionFromCommand("thread.next"), "next");
    assert.isNull(threadTraversalDirectionFromCommand("thread.jump.1"));
    assert.isNull(threadTraversalDirectionFromCommand(null));
  });

  it("shows jump hints only when configured modifiers match", () => {
    assert.isTrue(
      shouldShowThreadJumpHintsForModifiers(event({ metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
      }),
    );
    assert.isFalse(
      shouldShowThreadJumpHintsForModifiers(
        event({ metaKey: true, shiftKey: true }),
        DEFAULT_BINDINGS,
        {
          platform: "MacIntel",
        },
      ),
    );
    assert.isTrue(
      shouldShowThreadJumpHintsForModifiers(event({ ctrlKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
      }),
    );
  });

  it("never shows jump hints while the terminal is focused, even with an unrestricted binding", () => {
    assert.isFalse(
      shouldShowThreadJumpHintsForModifiers(event({ metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
    );
    assert.isTrue(
      shouldShowThreadJumpHintsForModifiers(event({ metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
    );
  });

  it("gives mod+1…9 to workspaces on desktop and to the browser on the web", () => {
    const input = event({ key: "1", metaKey: true });
    assert.isNull(
      resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
        context: { isDesktop: false, workspaceOpen: true },
      }),
    );
    assert.strictEqual(
      resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
        context: { isDesktop: true, workspaceOpen: true },
      }),
      "workspace.select.1",
    );
    // Sidebar thread jumps are unbound by default, so no hints appear.
    assert.isFalse(
      shouldShowThreadJumpHintsForModifiers(
        event({ metaKey: true }),
        DEFAULT_RESOLVED_KEYBINDINGS,
        {
          platform: "MacIntel",
          context: { isDesktop: true },
        },
      ),
    );
  });
});

describe("model picker navigation helpers", () => {
  it("maps jump commands to visible model indices", () => {
    assert.strictEqual(modelPickerJumpCommandForIndex(0), "modelPicker.jump.1");
    assert.strictEqual(modelPickerJumpCommandForIndex(2), "modelPicker.jump.3");
    assert.isNull(modelPickerJumpCommandForIndex(9));
    assert.strictEqual(modelPickerJumpIndexFromCommand("modelPicker.jump.1"), 0);
    assert.strictEqual(modelPickerJumpIndexFromCommand("modelPicker.jump.3"), 2);
    assert.isNull(modelPickerJumpIndexFromCommand("thread.jump.1"));
  });

  it("keeps default model jumps off the web even while the picker is open", () => {
    const input = event({ key: "3", metaKey: true });
    assert.isNull(
      resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
        context: { isDesktop: false, modelPickerOpen: true },
      }),
    );
    assert.strictEqual(
      resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
        context: { isDesktop: true, modelPickerOpen: true },
      }),
      "modelPicker.jump.3",
    );
    assert.strictEqual(
      resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
        context: { isDesktop: true, modelPickerOpen: false, workspaceOpen: true },
      }),
      "workspace.select.3",
    );
  });
});

describe("chat/editor shortcuts", () => {
  it("matches chat.new shortcut", () => {
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "o", metaKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
      }),
      "chat.new",
    );
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "o", ctrlKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
      }),
      "chat.new",
    );
  });

  it("matches chat.newLocal shortcut", () => {
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "n", metaKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
      }),
      "chat.newLocal",
    );
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "n", ctrlKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
      }),
      "chat.newLocal",
    );
  });

  it("matches editor.openFavorite shortcut", () => {
    assert.isTrue(
      isOpenFavoriteEditorShortcut(event({ key: "o", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
      }),
    );
    assert.isTrue(
      isOpenFavoriteEditorShortcut(event({ key: "o", ctrlKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
      }),
    );
  });

  it("matches commandPalette.toggle shortcut outside terminal focus", () => {
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "k", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
      "commandPalette.toggle",
    );
    assert.notStrictEqual(
      resolveShortcutCommand(event({ key: "k", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
      "commandPalette.toggle",
    );
  });

  it("matches filePicker.toggle shortcut outside terminal focus", () => {
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "p", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
      "filePicker.toggle",
    );
    assert.notStrictEqual(
      resolveShortcutCommand(event({ key: "p", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
      "filePicker.toggle",
    );
  });

  it("matches projectSearch.toggle shortcut outside terminal focus", () => {
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "f", metaKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
      "projectSearch.toggle",
    );
    assert.notStrictEqual(
      resolveShortcutCommand(event({ key: "f", metaKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
      "projectSearch.toggle",
    );
  });

  it("matches themeEditor.toggle on macOS and Windows", () => {
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "t", metaKey: true, altKey: true, shiftKey: true }),
        DEFAULT_BINDINGS,
        { platform: "MacIntel" },
      ),
      "themeEditor.toggle",
    );
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "t", ctrlKey: true, altKey: true, shiftKey: true }),
        DEFAULT_BINDINGS,
        { platform: "Win32" },
      ),
      "themeEditor.toggle",
    );
  });

  it("matches diff.toggle shortcut outside terminal focus", () => {
    assert.isTrue(
      isDiffToggleShortcut(event({ key: "d", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
    );
    assert.isFalse(
      isDiffToggleShortcut(event({ key: "d", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
    );
  });
});

describe("cross-command precedence", () => {
  it("uses when + order so a later focused rule overrides a global rule", () => {
    const keybindings = compile([
      { shortcut: modShortcut("n"), command: "chat.new" },
      {
        shortcut: modShortcut("n"),
        command: "terminal.new",
        whenAst: whenIdentifier("terminalFocus"),
      },
    ]);

    assert.isTrue(
      isTerminalNewShortcut(event({ key: "n", metaKey: true }), keybindings, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
    );
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "n", metaKey: true }), keybindings, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
      "terminal.new",
    );
    assert.isFalse(
      isTerminalNewShortcut(event({ key: "n", metaKey: true }), keybindings, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
    );
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "n", metaKey: true }), keybindings, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
      "chat.new",
    );
  });

  it("still lets a later global rule win when both rules match", () => {
    const keybindings = compile([
      {
        shortcut: modShortcut("n"),
        command: "terminal.new",
        whenAst: whenIdentifier("terminalFocus"),
      },
      { shortcut: modShortcut("n"), command: "chat.new" },
    ]);

    assert.isFalse(
      isTerminalNewShortcut(event({ key: "n", ctrlKey: true }), keybindings, {
        platform: "Linux",
        context: { terminalFocus: true },
      }),
    );
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "n", ctrlKey: true }), keybindings, {
        platform: "Linux",
        context: { terminalFocus: true },
      }),
      "chat.new",
    );
  });
});

describe("resolveShortcutCommand", () => {
  it("resolves a custom stop-thread shortcut", () => {
    const keybindings = compile([{ shortcut: modShortcut("escape"), command: "thread.stop" }]);

    assert.strictEqual(
      resolveShortcutCommand(event({ key: "Escape", metaKey: true }), keybindings, {
        platform: "MacIntel",
      }),
      "thread.stop",
    );
  });

  it("honors preview conditions for a stop-thread shortcut", () => {
    const keybindings = compile([
      {
        shortcut: modShortcut("escape"),
        command: "thread.stop",
        whenAst: whenIdentifier("previewFocus"),
      },
    ]);
    const input = event({ key: "Escape", metaKey: true });

    assert.isNull(
      resolveShortcutCommand(input, keybindings, {
        platform: "MacIntel",
        context: { previewFocus: false },
      }),
    );
    assert.strictEqual(
      resolveShortcutCommand(input, keybindings, {
        platform: "MacIntel",
        context: { previewFocus: true },
      }),
      "thread.stop",
    );
  });

  it("returns dynamic script commands", () => {
    const keybindings = compile([{ shortcut: modShortcut("r"), command: "script.setup.run" }]);

    assert.strictEqual(
      resolveShortcutCommand(event({ key: "r", ctrlKey: true }), keybindings, {
        platform: "Linux",
      }),
      "script.setup.run",
    );
  });

  it("routes mod+w to the terminal while focused and to the right panel otherwise", () => {
    const closeEvent = event({ key: "w", metaKey: true });
    assert.strictEqual(
      resolveShortcutCommand(closeEvent, DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
      "terminal.close",
    );
    assert.strictEqual(
      resolveShortcutCommand(closeEvent, DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
      "rightPanel.close",
    );
  });

  it("resolves a custom right panel maximize binding", () => {
    const keybindings = compile([
      {
        shortcut: modShortcut("m", { shiftKey: true }),
        command: "rightPanel.toggleMaximized",
      },
    ]);

    assert.strictEqual(
      resolveShortcutCommand(event({ key: "m", metaKey: true, shiftKey: true }), keybindings, {
        platform: "MacIntel",
      }),
      "rightPanel.toggleMaximized",
    );
  });

  it("navigates history with mod+[ and mod+] outside the terminal", () => {
    const back = event({ key: "[", code: "BracketLeft", metaKey: true });
    const forward = event({ key: "]", code: "BracketRight", ctrlKey: true });
    assert.strictEqual(
      resolveShortcutCommand(back, DEFAULT_RESOLVED_KEYBINDINGS, { platform: "MacIntel" }),
      "navigation.back",
    );
    assert.strictEqual(
      resolveShortcutCommand(forward, DEFAULT_RESOLVED_KEYBINDINGS, { platform: "Linux" }),
      "navigation.forward",
    );
    assert.isNull(
      resolveShortcutCommand(back, DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
    );
  });

  it("matches bracket shortcuts using the physical key code", () => {
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "{", code: "BracketLeft", metaKey: true, shiftKey: true }),
        DEFAULT_BINDINGS,
        {
          platform: "MacIntel",
        },
      ),
      "thread.previous",
    );
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "}", code: "BracketRight", ctrlKey: true, shiftKey: true }),
        DEFAULT_BINDINGS,
        {
          platform: "Linux",
        },
      ),
      "thread.next",
    );
  });

  it("matches punctuation shortcuts by physical key across keyboard layouts", () => {
    const keybindings = compile([
      { shortcut: modShortcut("'", { shiftKey: true }), command: "diff.toggle" },
    ]);

    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "@", code: "Quote", metaKey: true, shiftKey: true }),
        keybindings,
        { platform: "MacIntel" },
      ),
      "diff.toggle",
    );
    assert.isNull(
      resolveShortcutCommand(
        event({ key: '"', code: "Digit2", metaKey: true, shiftKey: true }),
        keybindings,
        { platform: "MacIntel" },
      ),
    );
  });

  it("does not let a punctuation position shadow a Latin layout key", () => {
    const keybindings = compile([
      { shortcut: modShortcut("m"), command: "diff.toggle" },
      { shortcut: modShortcut(";"), command: "sidebar.toggle" },
    ]);

    assert.strictEqual(
      resolveShortcutCommand(event({ key: "m", code: "Semicolon", metaKey: true }), keybindings, {
        platform: "MacIntel",
      }),
      "diff.toggle",
    );
  });

  it("matches Option-modified letters using the physical key code on macOS", () => {
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "∫", code: "KeyB", metaKey: true, altKey: true }),
        DEFAULT_BINDINGS,
        { platform: "MacIntel" },
      ),
      "rightPanel.toggle",
    );
  });

  it("matches non-Latin layout letters using the physical key code", () => {
    const keybindings = compile([{ shortcut: modShortcut("d"), command: "diff.toggle" }]);

    assert.strictEqual(
      resolveShortcutCommand(event({ key: "в", code: "KeyD", metaKey: true }), keybindings, {
        platform: "MacIntel",
      }),
      "diff.toggle",
    );
  });

  it("ignores the physical key code when the layout types a different Latin letter", () => {
    const keybindings = compile([{ shortcut: modShortcut("d"), command: "diff.toggle" }]);

    // On a remapped layout the physical D key types "a"; only the physical
    // key whose layout output is "d" may trigger the shortcut.
    assert.isNull(
      resolveShortcutCommand(event({ key: "a", code: "KeyD", metaKey: true }), keybindings, {
        platform: "MacIntel",
      }),
    );
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "d", code: "KeyL", metaKey: true }), keybindings, {
        platform: "MacIntel",
      }),
      "diff.toggle",
    );
  });
});

describe("formatShortcutLabel", () => {
  it("formats labels for macOS", () => {
    assert.strictEqual(
      formatShortcutLabel(modShortcut("d", { shiftKey: true }), "MacIntel"),
      "⇧⌘D",
    );
  });

  it("formats labels for non-macOS", () => {
    assert.strictEqual(
      formatShortcutLabel(modShortcut("d", { shiftKey: true }), "Linux"),
      "Ctrl+Shift+D",
    );
  });

  it("formats labels for plus key", () => {
    assert.strictEqual(formatShortcutLabel(modShortcut("+"), "MacIntel"), "⌘+");
    assert.strictEqual(formatShortcutLabel(modShortcut("+"), "Linux"), "Ctrl++");
  });
});

describe("isTerminalClearShortcut", () => {
  it("matches Ctrl+L on all platforms", () => {
    assert.isTrue(isTerminalClearShortcut(event({ key: "l", ctrlKey: true }), "Linux"));
    assert.isTrue(isTerminalClearShortcut(event({ key: "l", ctrlKey: true }), "MacIntel"));
  });

  it("matches Cmd+K on macOS", () => {
    assert.isTrue(isTerminalClearShortcut(event({ key: "k", metaKey: true }), "MacIntel"));
  });

  it("ignores non-keydown events", () => {
    assert.isFalse(
      isTerminalClearShortcut(event({ type: "keyup", key: "l", ctrlKey: true }), "Linux"),
    );
  });
});

describe("isRichTextBoldShortcut", () => {
  it("matches Mod+B without extra modifiers", () => {
    assert.isTrue(isRichTextBoldShortcut(event({ key: "b", metaKey: true })));
    assert.isTrue(isRichTextBoldShortcut(event({ key: "B", ctrlKey: true })));
  });

  it("matches the B key on non-Latin layouts, like the sidebar toggle does", () => {
    const cyrillicB = event({ key: "и", code: "KeyB", ctrlKey: true });
    assert.isTrue(isRichTextBoldShortcut(cyrillicB));
    assert.strictEqual(
      resolveShortcutCommand(cyrillicB, DEFAULT_BINDINGS, { platform: "Win32" }),
      "sidebar.toggle",
    );
  });

  it("follows the letter a Latin layout types, not the physical key", () => {
    assert.isFalse(isRichTextBoldShortcut(event({ key: "x", code: "KeyB", ctrlKey: true })));
    assert.isTrue(isRichTextBoldShortcut(event({ key: "b", code: "KeyN", ctrlKey: true })));
  });

  it("ignores shifted, alted, bare, and non-keydown presses", () => {
    assert.isFalse(isRichTextBoldShortcut(event({ key: "b", metaKey: true, shiftKey: true })));
    assert.isFalse(isRichTextBoldShortcut(event({ key: "b", metaKey: true, altKey: true })));
    assert.isFalse(isRichTextBoldShortcut(event({ key: "b" })));
    assert.isFalse(isRichTextBoldShortcut(event({ key: "i", metaKey: true })));
    assert.isFalse(isRichTextBoldShortcut(event({ type: "keyup", key: "b", metaKey: true })));
  });
});

describe("terminalDeleteShortcutData", () => {
  it("maps Cmd+Backspace on macOS to delete-to-line-start", () => {
    assert.strictEqual(
      terminalDeleteShortcutData(event({ key: "Backspace", metaKey: true }), "MacIntel"),
      "\u0015",
    );
  });

  it("ignores non-macOS platforms and modified variants", () => {
    assert.isNull(terminalDeleteShortcutData(event({ key: "Backspace", metaKey: true }), "Linux"));
    assert.isNull(
      terminalDeleteShortcutData(
        event({ key: "Backspace", metaKey: true, altKey: true }),
        "MacIntel",
      ),
    );
  });

  it("ignores non-keydown events", () => {
    assert.isNull(
      terminalDeleteShortcutData(
        event({ type: "keyup", key: "Backspace", metaKey: true }),
        "MacIntel",
      ),
    );
  });
});

describe("terminalNavigationShortcutData", () => {
  it("maps Option+Arrow on macOS to word movement", () => {
    assert.strictEqual(
      terminalNavigationShortcutData(event({ key: "ArrowLeft", altKey: true }), "MacIntel"),
      "\u001bb",
    );
    assert.strictEqual(
      terminalNavigationShortcutData(event({ key: "ArrowRight", altKey: true }), "MacIntel"),
      "\u001bf",
    );
  });

  it("maps Cmd+Arrow on macOS to line movement", () => {
    assert.strictEqual(
      terminalNavigationShortcutData(event({ key: "ArrowLeft", metaKey: true }), "MacIntel"),
      "\u0001",
    );
    assert.strictEqual(
      terminalNavigationShortcutData(event({ key: "ArrowRight", metaKey: true }), "MacIntel"),
      "\u0005",
    );
  });

  it("maps Ctrl+Arrow on non-macOS to word movement", () => {
    assert.strictEqual(
      terminalNavigationShortcutData(event({ key: "ArrowLeft", ctrlKey: true }), "Win32"),
      "\u001bb",
    );
    assert.strictEqual(
      terminalNavigationShortcutData(event({ key: "ArrowRight", ctrlKey: true }), "Linux"),
      "\u001bf",
    );
  });

  it("rejects unsupported combinations", () => {
    assert.isNull(
      terminalNavigationShortcutData(
        event({ key: "ArrowLeft", shiftKey: true, altKey: true }),
        "MacIntel",
      ),
    );
    assert.isNull(
      terminalNavigationShortcutData(event({ key: "ArrowLeft", metaKey: true }), "Linux"),
    );
    assert.isNull(terminalNavigationShortcutData(event({ key: "a", altKey: true }), "MacIntel"));
  });

  it("ignores non-keydown events", () => {
    assert.isNull(
      terminalNavigationShortcutData(
        event({ type: "keyup", key: "ArrowLeft", altKey: true }),
        "MacIntel",
      ),
    );
  });
});

describe("plus key parsing", () => {
  it("matches the plus key shortcut", () => {
    const plusBindings = compile([{ shortcut: modShortcut("+"), command: "terminal.toggle" }]);
    assert.isTrue(
      isTerminalToggleShortcut(event({ key: "+", metaKey: true }), plusBindings, {
        platform: "MacIntel",
      }),
    );
    assert.isTrue(
      isTerminalToggleShortcut(event({ key: "+", ctrlKey: true }), plusBindings, {
        platform: "Linux",
      }),
    );
  });
});

describe("composer and pull request shortcuts", () => {
  it("fills missing number shortcuts without replacing the saved URL binding", () => {
    const olderServerBindings = DEFAULT_RESOLVED_KEYBINDINGS.filter(
      (binding) =>
        binding.command !== "pullRequest.copyNumber" && binding.command !== "thread.copyReference",
    );
    const bindings = mergeWithDefaultKeybindings([
      ...olderServerBindings,
      ...compileResolvedKeybindingsConfig([
        { key: "mod+shift+8", command: "thread.copyReference", when: "!terminalFocus" },
      ]),
    ]);
    for (const [key, command] of [
      ["k", "pullRequest.copyNumber"],
      ["8", "thread.copyReference"],
      ["c", null],
      ["y", null],
    ] as const) {
      assert.strictEqual(
        resolveShortcutCommand(event({ key, metaKey: true, shiftKey: true }), bindings, {
          platform: "MacIntel",
        }),
        command,
      );
    }
  });

  it.each(["terminalOpen", "previewFocus", "previewOpen", "modelPickerOpen", "isWeb", "isDesktop"])(
    "honors custom PR shortcut conditions for %s",
    (condition) => {
      const bindings = compileResolvedKeybindingsConfig([
        { key: "mod+shift+k", command: "thread.copyReference", when: condition },
        { key: "mod+shift+k", command: "pullRequest.copyNumber", when: `!${condition}` },
      ]);
      const input = event({ key: "k", ctrlKey: true, shiftKey: true });
      for (const enabled of [false, true]) {
        assert.strictEqual(
          resolveShortcutCommand(input, bindings, {
            platform: "Linux",
            context: { [condition]: enabled },
          }),
          enabled ? "thread.copyReference" : "pullRequest.copyNumber",
        );
      }
    },
  );

  const shortcuts = [
    ["h", "composer.host"],
    ["a", "composer.mode"],
    ["x", "composer.workspace"],
    ["g", "composer.branch"],
    ["l", "composer.previousWorktree"],
    ["c", "thread.copyReference"],
    ["k", "pullRequest.copyNumber"],
    ["Enter", "thread.steerQueuedMessage"],
  ] as const;

  for (const platform of ["MacIntel", "Win32", "Linux"]) {
    it.each(shortcuts)(
      `resolves %s on ${platform} and leaves terminal input alone`,
      (key, command) => {
        const input = event({
          key,
          shiftKey: true,
          metaKey: platform === "MacIntel",
          ctrlKey: platform !== "MacIntel",
        });
        assert.strictEqual(
          resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
            platform,
            context: { terminalFocus: false },
          }),
          command,
        );
        assert.isNull(
          resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
            platform,
            context: { terminalFocus: true },
          }),
        );
      },
    );
  }

  for (const platform of ["MacIntel", "Win32", "Linux"]) {
    it.each([["s", "thread.settle"]])(
      `preserves the existing %s shortcut on ${platform}`,
      (key, command) => {
        assert.strictEqual(
          resolveShortcutCommand(
            event({
              key,
              shiftKey: true,
              metaKey: platform === "MacIntel",
              ctrlKey: platform !== "MacIntel",
            }),
            DEFAULT_RESOLVED_KEYBINDINGS,
            { platform },
          ),
          command,
        );
      },
    );
  }

  const altEffortBindings = compileResolvedKeybindingsConfig([
    { key: "mod+alt+e", command: "composer.effort", when: "!terminalFocus" },
  ]);

  it("leaves AltGr text entry alone with a custom Alt binding", () => {
    for (const platform of ["Win32", "Linux"]) {
      const input = event({
        key: "€",
        code: "KeyE",
        ctrlKey: true,
        altKey: true,
        getModifierState: (key) => key === "AltGraph",
      });
      assert.isNull(resolveShortcutCommand(input, altEffortBindings, { platform }));
      assert.strictEqual(
        resolveShortcutCommand({ ...input, getModifierState: () => false }, altEffortBindings, {
          platform,
        }),
        "composer.effort",
      );
    }
  });

  it("keeps Firefox modifier reporting usable on Windows and macOS", () => {
    const getModifierState = (key: string) => key === "AltGraph";
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "e", ctrlKey: true, altKey: true, getModifierState }),
        altEffortBindings,
        { platform: "Win32" },
      ),
      "composer.effort",
    );
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "´", code: "KeyE", metaKey: true, altKey: true, getModifierState }),
        altEffortBindings,
        { platform: "MacIntel" },
      ),
      "composer.effort",
    );
  });

  it.each(shortcuts)("uses a custom binding for %s", (_key, command) => {
    const bindings = compileResolvedKeybindingsConfig([
      { key: "mod+shift+y", command, when: "!terminalFocus" },
    ]);
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "Y", code: "KeyY", ctrlKey: true, shiftKey: true }),
        bindings,
        { platform: "Linux" },
      ),
      command,
    );
  });

  for (const platform of ["MacIntel", "Win32", "Linux"]) {
    it.each([
      ["ArrowUp", "modelPicker.previousProvider"],
      ["ArrowDown", "modelPicker.nextProvider"],
    ] as const)(`limits %s to the model picker on ${platform}`, (key, command) => {
      const input = event({
        key,
        shiftKey: true,
        metaKey: platform === "MacIntel",
        ctrlKey: platform !== "MacIntel",
      });
      assert.strictEqual(
        resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
          platform,
          context: { modelPickerOpen: true },
        }),
        command,
      );
      assert.isNull(
        resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
          platform,
          context: { modelPickerOpen: false },
        }),
      );
    });
  }
});

describe("Usage shortcuts", () => {
  it("scopes letter shortcuts to Usage", () => {
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "t" }), DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "Linux",
        context: { usagePageOpen: true },
      }),
      "usage.tokens",
    );
    assert.isNull(
      resolveShortcutCommand(event({ key: "t" }), DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "Linux",
      }),
    );
  });

  it.each(["Linux", "MacIntel"])(
    "preserves desktop numbered workspace shortcuts on Usage on %s",
    (platform) => {
      const shortcut = event({
        key: "2",
        ctrlKey: platform === "Linux",
        metaKey: platform === "MacIntel",
      });
      assert.strictEqual(
        resolveShortcutCommand(shortcut, DEFAULT_RESOLVED_KEYBINDINGS, {
          platform,
          context: { usagePageOpen: true, isDesktop: true, workspaceOpen: true },
        }),
        "workspace.select.2",
      );
      assert.isNotNull(
        shortcutLabelForCommand(DEFAULT_RESOLVED_KEYBINDINGS, "workspace.select.2", {
          platform,
          context: { usagePageOpen: true, isDesktop: true, workspaceOpen: true },
        }),
      );
    },
  );

  it("matches shifted number keys for periods and only on Usage", () => {
    const shortcut = event({ key: "!", code: "Digit1", ctrlKey: true, shiftKey: true });
    assert.strictEqual(
      resolveShortcutCommand(shortcut, DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "Linux",
        context: { usagePageOpen: true },
      }),
      "usage.period.day",
    );
    assert.isNull(
      resolveShortcutCommand(shortcut, DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "Linux",
      }),
    );
  });
});

describe("cmux workspace keymap", () => {
  const desktop = { isDesktop: true, isWeb: false, workspaceOpen: true };
  const web = { isDesktop: false, isWeb: true, workspaceOpen: true };
  const resolveOnMac = (input: ShortcutEventLike, context: Record<string, boolean>) =>
    resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, { platform: "MacIntel", context });

  // The D10 table: chord on desktop → command, and the browser substitute where Chrome reserves it.
  const rows: ReadonlyArray<{
    readonly command: KeybindingCommand;
    readonly desktop: ShortcutEventLike;
    // null: desktop-only, the browser keeps the chord (⌘1…9 switch browser tabs).
    readonly web?: ShortcutEventLike | null;
  }> = [
    { command: "workspace.splitRight", desktop: event({ key: "d", metaKey: true }) },
    {
      command: "pane.focusLeft",
      desktop: event({ key: "ArrowLeft", altKey: true, shiftKey: true }),
    },
    {
      command: "pane.focusRight",
      desktop: event({ key: "ArrowRight", altKey: true, shiftKey: true }),
    },
    { command: "pane.focusUp", desktop: event({ key: "ArrowUp", altKey: true, shiftKey: true }) },
    {
      command: "pane.focusDown",
      desktop: event({ key: "ArrowDown", altKey: true, shiftKey: true }),
    },
    {
      command: "tab.previous",
      desktop: event({ key: "ArrowLeft", metaKey: true, shiftKey: true }),
    },
    { command: "tab.next", desktop: event({ key: "ArrowRight", metaKey: true, shiftKey: true }) },
    {
      command: "workspace.previous",
      desktop: event({ key: "ArrowUp", metaKey: true, shiftKey: true }),
    },
    {
      command: "workspace.next",
      desktop: event({ key: "ArrowDown", metaKey: true, shiftKey: true }),
    },
    { command: "pane.zoom", desktop: event({ key: "Enter", altKey: true, shiftKey: true }) },
    {
      command: "tab.new",
      desktop: event({ key: "t", metaKey: true }),
      web: event({ key: "†", code: "KeyT", altKey: true }),
    },
    {
      command: "tab.close",
      desktop: event({ key: "w", metaKey: true }),
      web: event({ key: "∑", code: "KeyW", altKey: true }),
    },
    {
      command: "tab.reopen",
      desktop: event({ key: "T", code: "KeyT", metaKey: true, shiftKey: true }),
      web: event({ key: "ˇ", code: "KeyT", altKey: true, shiftKey: true }),
    },
    {
      command: "tab.closeOthers",
      desktop: event({ key: "†", code: "KeyT", metaKey: true, altKey: true }),
    },
    { command: "tab.select.1", desktop: event({ key: "1", code: "Digit1", ctrlKey: true }) },
    { command: "tab.select.last", desktop: event({ key: "9", code: "Digit9", ctrlKey: true }) },
    {
      command: "workspace.new",
      desktop: event({ key: "n", metaKey: true }),
      web: event({ key: "˜", code: "KeyN", altKey: true }),
    },
    {
      command: "workspace.select.1",
      desktop: event({ key: "1", code: "Digit1", metaKey: true }),
      web: null,
    },
    {
      command: "workspace.select.last",
      desktop: event({ key: "9", code: "Digit9", metaKey: true }),
      web: null,
    },
    { command: "tab.rename", desktop: event({ key: "r", metaKey: true }) },
    {
      command: "workspace.rename",
      desktop: event({ key: "R", code: "KeyR", metaKey: true, shiftKey: true }),
    },
    { command: "workspace.switcher", desktop: event({ key: "p", metaKey: true }) },
    {
      command: "commandPalette.toggle",
      desktop: event({ key: "P", code: "KeyP", metaKey: true, shiftKey: true }),
    },
    {
      command: "rightPanel.toggle",
      desktop: event({ key: "E", code: "KeyE", metaKey: true, shiftKey: true }),
    },
    { command: "attention.list", desktop: event({ key: "i", metaKey: true }) },
    {
      command: "attention.jumpLatest",
      desktop: event({ key: "U", code: "KeyU", metaKey: true, shiftKey: true }),
    },
    {
      command: "pane.resizeLeft",
      desktop: event({ key: "H", code: "KeyH", ctrlKey: true, shiftKey: true }),
    },
    {
      command: "pane.equalize",
      desktop: event({ key: "+", code: "Equal", ctrlKey: true, metaKey: true, shiftKey: true }),
    },
    {
      command: "tab.moveLeft",
      desktop: event({ key: "ArrowLeft", altKey: true, metaKey: true, shiftKey: true }),
    },
    {
      command: "tab.moveNextPane",
      desktop: event({
        key: "}",
        code: "BracketRight",
        ctrlKey: true,
        metaKey: true,
        shiftKey: true,
      }),
    },
    {
      command: "tab.reorderLeft",
      desktop: event({
        key: "”",
        code: "BracketLeft",
        altKey: true,
        metaKey: true,
        shiftKey: true,
      }),
    },
  ];

  it("resolves every row on desktop and its browser substitute on web", () => {
    for (const row of rows) {
      assert.strictEqual(resolveOnMac(row.desktop, desktop), row.command, row.command);
      if (row.web === null) {
        assert.isNull(resolveOnMac(row.desktop, web), `${row.command} on web`);
      } else {
        assert.strictEqual(
          resolveOnMac(row.web ?? row.desktop, web),
          row.command,
          `${row.command} on web`,
        );
      }
    }
  });

  it("leaves the chords Chrome reserves to the browser in a web tab", () => {
    for (const reserved of [
      event({ key: "t", metaKey: true }),
      event({ key: "T", code: "KeyT", metaKey: true, shiftKey: true }),
      event({ key: "n", metaKey: true }),
    ]) {
      assert.isNull(resolveOnMac(reserved, web));
    }
    assert.strictEqual(resolveOnMac(event({ key: "w", metaKey: true }), web), "rightPanel.close");
  });

  it("wins over composer text selection", () => {
    const typing = { ...desktop, editableFocus: true };
    assert.strictEqual(
      resolveOnMac(event({ key: "ArrowLeft", altKey: true, shiftKey: true }), typing),
      "pane.focusLeft",
    );
    assert.strictEqual(
      resolveOnMac(event({ key: "ArrowRight", metaKey: true, shiftKey: true }), typing),
      "tab.next",
    );
    assert.strictEqual(
      resolveOnMac(event({ key: "ArrowDown", metaKey: true, shiftKey: true }), typing),
      "workspace.next",
    );
  });

  it("yields to the terminal, the right panel and an open model picker", () => {
    assert.strictEqual(
      resolveOnMac(event({ key: "w", metaKey: true }), { ...desktop, terminalFocus: true }),
      "terminal.close",
    );
    assert.strictEqual(
      resolveOnMac(event({ key: "w", metaKey: true }), { ...desktop, previewFocus: true }),
      "rightPanel.close",
    );
    assert.strictEqual(
      resolveOnMac(event({ key: "d", metaKey: true }), { ...desktop, terminalFocus: true }),
      "terminal.split",
    );
    assert.strictEqual(
      resolveOnMac(event({ key: "2", code: "Digit2", metaKey: true }), {
        ...desktop,
        modelPickerOpen: true,
      }),
      "modelPicker.jump.2",
    );
    assert.strictEqual(
      resolveOnMac(event({ key: "ArrowDown", metaKey: true, shiftKey: true }), {
        ...desktop,
        modelPickerOpen: true,
      }),
      "modelPicker.nextProvider",
    );
  });

  it("stays inert until the workspace host is mounted", () => {
    const closed = { ...desktop, workspaceOpen: false };
    assert.strictEqual(
      resolveOnMac(event({ key: "w", metaKey: true }), closed),
      "rightPanel.close",
    );
    assert.isNull(resolveOnMac(event({ key: "d", metaKey: true }), closed));
    assert.isNull(resolveOnMac(event({ key: "ArrowLeft", altKey: true, shiftKey: true }), closed));
  });

  it("moves the t3 commands cmux claims to free chords", () => {
    const moved: ReadonlyArray<[ShortcutEventLike, KeybindingCommand]> = [
      [event({ key: "D", code: "KeyD", metaKey: true, shiftKey: true }), "diff.toggle"],
      [event({ key: "π", code: "KeyP", metaKey: true, altKey: true }), "filePicker.toggle"],
      [event({ key: "´", code: "KeyE", metaKey: true, altKey: true }), "composer.effort"],
      [event({ key: "O", code: "KeyO", metaKey: true, shiftKey: true }), "chat.new"],
    ];
    for (const [input, command] of moved) {
      assert.strictEqual(resolveOnMac(input, desktop), command, command);
    }
  });

  it("keeps Control chords to macOS, where Control is not mod", () => {
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "K", code: "KeyK", ctrlKey: true, shiftKey: true }),
        DEFAULT_RESOLVED_KEYBINDINGS,
        { platform: "Linux", context: desktop },
      ),
      "pullRequest.copyNumber",
    );
  });
});
