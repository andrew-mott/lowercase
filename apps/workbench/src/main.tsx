import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App";
import { Provider } from "react-redux";
import { store } from "./redux/store";
import { SseBootstrap } from "./app/SseBootstrap";
import { ThemeProvider } from "./contexts/theme-provider";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <Provider store={store}>
        <BrowserRouter>
          <TooltipProvider>
            <SseBootstrap />
            <Toaster />
            <App />
          </TooltipProvider>
        </BrowserRouter>
      </Provider>
    </ThemeProvider>
  </StrictMode>,
);
