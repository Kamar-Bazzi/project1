import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PreferencesProvider, usePreferences } from "./preferences";

function PreferenceProbe() {
  const { locale, setLocale, theme, toggleTheme, t } = usePreferences();
  return (
    <div>
      <span>{t("navigation.logout")}</span>
      <span data-testid="locale">{locale}</span>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setLocale("ar")}>
        Arabic
      </button>
      <button type="button" onClick={toggleTheme}>
        Theme
      </button>
    </div>
  );
}

describe("PreferencesProvider", () => {
  it("applies Arabic RTL and dark mode preferences to the document", async () => {
    const user = userEvent.setup();

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("Log out")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Arabic" }));
    await user.click(screen.getByRole("button", { name: "Theme" }));

    expect(screen.getByTestId("locale")).toHaveTextContent("ar");
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByText("تسجيل الخروج")).toBeInTheDocument();
  });
});
