import { Navigate, Route, Routes } from "react-router-dom";
import { RootLayout } from "./RootLayout";
import { System } from "@/pages/System";
import { Evals } from "@/pages/Evals";
import { Workbench } from "@/pages/Workbench";

export function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<Navigate to="/workbench" replace />} />
        <Route path="/workbench" element={<Workbench />} />
        <Route path="/evals" element={<Evals />} />
        <Route path="/system" element={<System />} />
        <Route path="*" element={<Navigate to="/workbench" replace />} />
      </Route>
    </Routes>
  );
}
