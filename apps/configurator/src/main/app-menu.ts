import type { MenuItemConstructorOptions } from "electron";

export interface AppMenuHandlers {
  /** Help → Update: check for, download and install a new version. */
  onUpdate: () => void;
  /** Help → About Me: show the developer's details. */
  onAboutMe: () => void;
  /** Help → ICAI Project: show the ICAI project summary. */
  onIcaiProject: () => void;
}

/**
 * Builds the application-menu template. Kept as a pure function — it imports
 * only the erased `MenuItemConstructorOptions` *type* from electron, no
 * runtime electron — so it unit-tests in plain Node and keeps `main/index.ts`
 * thin. The Help submenu carries the three product actions: Update, About Me,
 * ICAI Project. The standard File/Edit/View/Window menus are retained (a
 * custom application menu otherwise replaces Electron's default entirely).
 */
export function createAppMenuTemplate(
  handlers: AppMenuHandlers,
): MenuItemConstructorOptions[] {
  return [
    { label: "File", submenu: [{ role: "quit" }] },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
    {
      role: "help",
      label: "Help",
      submenu: [
        { label: "Update", click: () => handlers.onUpdate() },
        { type: "separator" },
        { label: "About Me", click: () => handlers.onAboutMe() },
        { label: "ICAI Project", click: () => handlers.onIcaiProject() },
      ],
    },
  ];
}
