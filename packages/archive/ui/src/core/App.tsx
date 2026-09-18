import { Header } from "../layout/Header.js";
import { ObsPanel } from "../components/observability/ObsPanel.js";
import { AppContextProvider } from "../context/AppContext.js";

export function App() {
  return (
    <>
      <AppContextProvider>
        <Header title="thing" />
        <main>
          <div id="divided-main">
            <div id="right-panel">
              <h2>Observability</h2>
              <ObsPanel />
            </div>
          </div>
        </main>
      </AppContextProvider>
    </>
  );
}
