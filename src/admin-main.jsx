import { createRoot } from "react-dom/client";
import AdminApp from "./AdminApp.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import cfg from "../config/letter.config.js";
import { injectThemeCss } from "../config/theme-css.js";
import "./index.css";

injectThemeCss(cfg.theme);

// Admin dashboard entrypoint. Served only at the secret /${ADMIN_PATH} route
// (see server/index.js) via admin.html, so AdminApp is bundled separately and
// never ships in the public homepage bundle. Access is gated server-side, so
// this renders AdminApp unconditionally.
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <AdminApp />
  </ErrorBoundary>,
);
