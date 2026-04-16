import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardApp } from "./pages/DashboardApp";
import { AboutPage } from "./pages/AboutPage";
import { emitJsErrorMetric } from "./services/telemetry";

export default function App() {
  useEffect(() => {
    const onError = () => emitJsErrorMetric("runtime");
    const onUnhandledRejection = () => emitJsErrorMetric("promise_rejection");

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<DashboardApp />} />
        <Route path="/dashboard" element={<Navigate replace to="/app" />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
