import { useTheme } from "@/contexts/use-theme";

export type EventGraphTheme = {
  series: {
    circle: {
      failedColor: string;
      completedColor: string;
    };
    text: {
      selectedColor: string;
      color: string;
    };
    bar: {
      color: string;
    };
  };
  dataZoom: {
    fillerColor: string;
    backgroundColor: string;
    borderColor: string;
    handleStyle: {
      color: string;
      shadowBlur: number;
      shadowColor: string;
      borderColor: string;
    };
    moveHandleStyle: {
      color: string;
      opacity: number;
    };
  };
};

const LIGHT_THEME: EventGraphTheme = {
  series: {
    circle: {
      failedColor: "#d3344a",
      completedColor: "#34d399",
    },
    text: {
      color: "#1f1f1f",
      selectedColor: "rgb(10, 167, 215)",
    },
    bar: {
      color: "#34d399",
    },
  },
  dataZoom: {
    fillerColor: "rgba(16, 185, 129, 0.15)",
    backgroundColor: "rgba(0,0,0,0)",
    borderColor: "#334155",
    handleStyle: {
      color: "#ffffff",
      shadowBlur: 4,
      shadowColor: "rgba(0,0,0,0.5)",
      borderColor: "#334155",
    },
    moveHandleStyle: {
      color: "#c1c1c1",
      opacity: 0.9,
    },
  },
};

const DARK_THEME: EventGraphTheme = {
  series: {
    circle: {
      failedColor: "#d3344a",
      completedColor: "#34d399",
    },
    text: {
      color: "#e2e8f0",
      selectedColor: "oklch(94.5% 0.129 101.54)",
    },
    bar: {
      color: "#34d399",
    },
  },
  dataZoom: {
    fillerColor: "rgba(16, 185, 129, 0.15)",
    backgroundColor: "rgba(0,0,0,0)",
    borderColor: "#334155",
    handleStyle: {
      color: "#666666",
      shadowBlur: 4,
      shadowColor: "rgba(0,0,0,0)",
      borderColor: "#555555",
    },
    moveHandleStyle: {
      color: "#555555",
      opacity: 0.9,
    },
  },
};

export function useEventGraphTheme(): EventGraphTheme {
  const theme = useTheme();

  if (theme.resolvedTheme === "light") return LIGHT_THEME;
  return DARK_THEME;
}
