import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "../../contexts/use-theme";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      closeButton
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success-foreground" />,
        info: <InfoIcon className="size-4 text-info-foreground" />,
        warning: (
          <TriangleAlertIcon className="size-4 text-warning-foreground" />
        ),
        error: <OctagonXIcon className="size-4 text-error-foreground" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // cast through `unknown`, not directly to `React.CSSProperties` --
          // this file's React.CSSProperties and sonner's own declared
          // `style` type both resolve through different, mismatched
          // installed csstype versions, so a direct assertion fails
          // structurally even though they're the "same" type by name
        } as unknown as ToasterProps["style"]
      }
      {...props}
    />
  );
};

export { Toaster };
