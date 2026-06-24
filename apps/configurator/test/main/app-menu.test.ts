import { describe, it, expect, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import { createAppMenuTemplate } from "../../src/main/app-menu.js";

function helpSubmenu(template: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  const help = template.find((i) => i.role === "help");
  return (help?.submenu as MenuItemConstructorOptions[]) ?? [];
}

describe("createAppMenuTemplate", () => {
  it("exposes a Help menu with Update, About Me and ICAI Project", () => {
    const template = createAppMenuTemplate({
      onUpdate: vi.fn(),
      onAboutMe: vi.fn(),
      onIcaiProject: vi.fn(),
    });
    const labels = helpSubmenu(template)
      .map((i) => i.label)
      .filter((l): l is string => typeof l === "string");
    expect(labels).toContain("Update");
    expect(labels).toContain("About Me");
    expect(labels).toContain("ICAI Project");
  });

  it("wires each Help item to its handler", () => {
    const onUpdate = vi.fn();
    const onAboutMe = vi.fn();
    const onIcaiProject = vi.fn();
    const template = createAppMenuTemplate({ onUpdate, onAboutMe, onIcaiProject });
    const submenu = helpSubmenu(template);
    const click = (label: string): (() => void) => {
      const fn = submenu.find((i) => i.label === label)?.click;
      return fn as unknown as () => void;
    };

    click("Update")();
    click("About Me")();
    click("ICAI Project")();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onAboutMe).toHaveBeenCalledTimes(1);
    expect(onIcaiProject).toHaveBeenCalledTimes(1);
  });

  it("retains the standard File/Edit/View/Window menus", () => {
    const template = createAppMenuTemplate({
      onUpdate: vi.fn(),
      onAboutMe: vi.fn(),
      onIcaiProject: vi.fn(),
    });
    const labels = template.map((i) => i.label);
    expect(labels).toContain("File");
    expect(labels).toContain("Edit");
    expect(labels).toContain("View");
    expect(labels).toContain("Window");
  });
});
