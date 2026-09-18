import { LaptopIcon, MoonIcon, SunIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/contexts/use-theme";
import type { Theme } from "@/contexts/use-theme";

export function System() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-5">System</h2>

      <p>Theme</p>
      <ToggleGroup
        type="single"
        variant="outline"
        value={theme}
        onValueChange={(value) => {
          if (value) setTheme(value as Theme);
        }}
        className="mt-2 cursor-pointer"
      >
        <ToggleGroupItem
          value="system"
          aria-label="Use system theme"
          className="data-[state=on]:bg-neutral-200 data-[state=on]:dark:bg-neutral-700 cursor-pointer"
        >
          <LaptopIcon />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="light"
          aria-label="Use light theme"
          className="data-[state=on]:bg-neutral-200 data-[state=on]:dark:bg-neutral-700 cursor-pointer"
        >
          <SunIcon />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="dark"
          aria-label="Use dark theme"
          className="data-[state=on]:bg-neutral-200 data-[state=on]:dark:bg-neutral-700 cursor-pointer"
        >
          <MoonIcon />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
