import { Link, Outlet, useLocation } from "react-router-dom";
import { ScaleIcon, SettingsIcon, RocketIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/workbench", label: "Workbench", icon: RocketIcon },
  { to: "/evals", label: "Evals", icon: ScaleIcon },
  { to: "/system", label: "System", icon: SettingsIcon },
];

export function RootLayout() {
  const location = useLocation();

  return (
    <div className="h-screen flex ">
      <nav className="w-18 shrink-0 flex flex-col items-center gap-0.5 py-1  bg-workbench-panel-secondary overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 w-16 rounded-sm py-2 text-[10px] leading-none transition-colors",
                isActive
                  ? "text-foreground bg-neutral-200/80 dark:bg-neutral-700/80"
                  : "text-muted-foreground hover:text-foreground hover:bg-neutral-200/40 hover:dark:bg-neutral-700/40",
              )}
            >
              <item.icon className="size-4" />
              <span className="truncate max-w-full">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
