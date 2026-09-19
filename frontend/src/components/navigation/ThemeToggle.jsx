import { useTheme } from "../../hooks/useTheme";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle-btn"
      aria-label="Toggle Dark/Light Theme"
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
    >
      {theme === "dark" ? (
        <Sun className="icon-xs cyan" />
      ) : (
        <Moon className="icon-xs text-muted-slate" />
      )}
    </button>
  );
}
