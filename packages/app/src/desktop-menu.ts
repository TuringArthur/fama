export type DesktopMenuPlatform = "macos" | "windows"

export type DesktopMenuAction =
  | "app.checkForUpdates"
  | "app.relaunch"
  | "edit.undo"
  | "edit.redo"
  | "edit.cut"
  | "edit.copy"
  | "edit.paste"
  | "edit.delete"
  | "edit.selectAll"
  | "view.reload"
  | "view.toggleDevTools"
  | "view.resetZoom"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.toggleFullscreen"
  | "window.new"
  | "window.close"
  | "window.minimize"
  | "window.toggleMaximize"

export type DesktopMenuRole =
  | "about"
  | "close"
  | "copy"
  | "cut"
  | "hide"
  | "hideOthers"
  | "paste"
  | "quit"
  | "redo"
  | "reload"
  | "resetZoom"
  | "selectAll"
  | "toggleDevTools"
  | "togglefullscreen"
  | "undo"
  | "unhide"
  | "windowMenu"
  | "zoomIn"
  | "zoomOut"

export type DesktopMenuItem = {
  type: "item"
  label?: string
  labelKey?: string
  command?: string
  action?: DesktopMenuAction
  role?: DesktopMenuRole
  href?: string
  accelerator?: Partial<Record<DesktopMenuPlatform, string>>
  enabled?: "updater"
  platforms?: DesktopMenuPlatform[]
}

export type DesktopMenuSeparator = {
  type: "separator"
  platforms?: DesktopMenuPlatform[]
}

export type DesktopMenuEntry = DesktopMenuItem | DesktopMenuSeparator

export type DesktopMenu = {
  id: string
  label: string
  labelKey?: string
  role?: DesktopMenuRole
  items?: DesktopMenuEntry[]
  platforms?: DesktopMenuPlatform[]
}

export const DESKTOP_MENU: DesktopMenu[] = [
  {
    id: "app",
    label: "OpenCode",
    labelKey: "menu.app",
    platforms: ["macos"],
    items: [
      { type: "item", role: "about" },
      {
        type: "item",
        label: "Check for Updates...",
        labelKey: "menu.checkForUpdates",
        action: "app.checkForUpdates",
        enabled: "updater",
      },
      {
        type: "item",
        label: "Settings",
        labelKey: "sidebar.settings",
        command: "settings.open",
        accelerator: { macos: "Cmd+," },
      },
      { type: "item", label: "Reload Webview", labelKey: "menu.reloadWebview", action: "view.reload" },
      { type: "item", label: "Restart", labelKey: "menu.restart", action: "app.relaunch" },
      {
        type: "item",
        label: "Export Logs...",
        labelKey: "menu.exportLogs",
        command: "logs.export",
      },
      { type: "separator" },
      { type: "item", role: "hide" },
      { type: "item", role: "hideOthers" },
      { type: "item", role: "unhide" },
      { type: "separator" },
      { type: "item", role: "quit" },
    ],
  },
  {
    id: "file",
    label: "File",
    labelKey: "menu.file",
    items: [
      {
        type: "item",
        label: "New Session",
        labelKey: "command.session.new",
        command: "session.new",
        accelerator: { macos: "Shift+Cmd+S" },
      },
      {
        type: "item",
        label: "Open Project...",
        labelKey: "command.project.open",
        command: "project.open",
        accelerator: { macos: "Cmd+O" },
      },
      {
        type: "item",
        label: "Settings",
        labelKey: "sidebar.settings",
        command: "settings.open",
        accelerator: { windows: "Ctrl+," },
        platforms: ["windows"],
      },
      {
        type: "item",
        label: "New Window",
        labelKey: "menu.newWindow",
        action: "window.new",
        accelerator: { macos: "Cmd+Shift+N", windows: "Ctrl+Shift+N" },
      },
      { type: "separator" },
      {
        type: "item",
        label: "Close Window",
        labelKey: "menu.closeWindow",
        action: "window.close",
        role: "close",
      },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    labelKey: "menu.edit",
    items: [
      {
        type: "item",
        label: "Undo",
        labelKey: "menu.undo",
        action: "edit.undo",
        role: "undo",
        accelerator: { windows: "Ctrl+Z" },
      },
      {
        type: "item",
        label: "Redo",
        labelKey: "menu.redo",
        action: "edit.redo",
        role: "redo",
        accelerator: { windows: "Ctrl+Y" },
      },
      { type: "separator" },
      {
        type: "item",
        label: "Cut",
        labelKey: "menu.cut",
        action: "edit.cut",
        role: "cut",
        accelerator: { windows: "Ctrl+X" },
      },
      {
        type: "item",
        label: "Copy",
        labelKey: "menu.copy",
        action: "edit.copy",
        role: "copy",
        accelerator: { windows: "Ctrl+C" },
      },
      {
        type: "item",
        label: "Paste",
        labelKey: "menu.paste",
        action: "edit.paste",
        role: "paste",
        accelerator: { windows: "Ctrl+V" },
      },
      { type: "item", label: "Delete", labelKey: "common.delete", action: "edit.delete" },
      {
        type: "item",
        label: "Select All",
        labelKey: "menu.selectAll",
        action: "edit.selectAll",
        role: "selectAll",
        accelerator: { windows: "Ctrl+A" },
      },
    ],
  },
  {
    id: "view",
    label: "View",
    labelKey: "menu.view",
    items: [
      { type: "item", label: "Toggle Sidebar", labelKey: "command.sidebar.toggle", command: "sidebar.toggle" },
      {
        type: "item",
        label: "Toggle Terminal",
        labelKey: "command.terminal.toggle",
        command: "terminal.toggle",
        accelerator: { macos: "Ctrl+`" },
      },
      {
        type: "item",
        label: "Toggle File Tree",
        labelKey: "command.fileTree.toggle",
        command: "fileTree.toggle",
      },
      { type: "separator" },
      {
        type: "item",
        label: "Reload",
        labelKey: "menu.reload",
        action: "view.reload",
        role: "reload",
      },
      {
        type: "item",
        label: "Toggle Developer Tools",
        labelKey: "menu.toggleDevTools",
        action: "view.toggleDevTools",
        role: "toggleDevTools",
      },
      { type: "separator" },
      {
        type: "item",
        label: "Actual Size",
        labelKey: "menu.actualSize",
        action: "view.resetZoom",
        role: "resetZoom",
        accelerator: { windows: "Ctrl+0" },
      },
      {
        type: "item",
        label: "Zoom In",
        labelKey: "menu.zoomIn",
        action: "view.zoomIn",
        role: "zoomIn",
        accelerator: { windows: "Ctrl++" },
      },
      {
        type: "item",
        label: "Zoom Out",
        labelKey: "menu.zoomOut",
        action: "view.zoomOut",
        role: "zoomOut",
        accelerator: { windows: "Ctrl+-" },
      },
      { type: "separator" },
      {
        type: "item",
        label: "Toggle Full Screen",
        labelKey: "menu.toggleFullscreen",
        action: "view.toggleFullscreen",
        role: "togglefullscreen",
      },
    ],
  },
  {
    id: "go",
    label: "Go",
    labelKey: "menu.go",
    items: [
      {
        type: "item",
        label: "Back",
        labelKey: "common.goBack",
        command: "common.goBack",
        accelerator: { macos: "Cmd+[" },
      },
      {
        type: "item",
        label: "Forward",
        labelKey: "common.goForward",
        command: "common.goForward",
        accelerator: { macos: "Cmd+]" },
      },
      { type: "separator" },
      {
        type: "item",
        label: "Previous Session",
        labelKey: "command.session.previous",
        command: "session.previous",
        accelerator: { macos: "Option+Up" },
      },
      {
        type: "item",
        label: "Next Session",
        labelKey: "command.session.next",
        command: "session.next",
        accelerator: { macos: "Option+Down" },
      },
      { type: "separator" },
      {
        type: "item",
        label: "Previous Project",
        labelKey: "command.project.previous",
        command: "project.previous",
        accelerator: { macos: "Cmd+Option+Up" },
      },
      {
        type: "item",
        label: "Next Project",
        labelKey: "command.project.next",
        command: "project.next",
        accelerator: { macos: "Cmd+Option+Down" },
      },
    ],
  },
  {
    id: "window",
    label: "Window",
    labelKey: "menu.window",
    role: "windowMenu",
    items: [
      { type: "item", label: "Minimize", labelKey: "menu.minimize", action: "window.minimize" },
      { type: "item", label: "Maximize", labelKey: "menu.maximize", action: "window.toggleMaximize" },
      { type: "separator" },
      {
        type: "item",
        label: "Close Window",
        labelKey: "menu.closeWindow",
        action: "window.close",
      },
    ],
  },
  {
    id: "help",
    label: "Help",
    labelKey: "menu.help",
    items: [
      {
        type: "item",
        label: "Fama Documentation",
        labelKey: "menu.documentation",
        href: "https://fama.stdalw.cn/docs",
      },
      {
        type: "item",
        label: "Support Forum",
        labelKey: "menu.supportForum",
        href: "https://fama.stdalw.cn",
      },
      {
        type: "item",
        label: "Export Logs...",
        labelKey: "menu.exportLogs",
        command: "logs.export",
      },
      { type: "separator" },
      {
        type: "item",
        label: "Share Feedback",
        labelKey: "menu.shareFeedback",
        href: "https://fama.stdalw.cn/feedback",
      },
      {
        type: "item",
        label: "Report a Bug",
        labelKey: "menu.reportBug",
        href: "https://fama.stdalw.cn/bug",
      },
    ],
  },
]

export function desktopMenuVisible(item: { platforms?: DesktopMenuPlatform[] }, platform: DesktopMenuPlatform) {
  return !item.platforms || item.platforms.includes(platform)
}
