import { createRoot } from "react-dom/client";
import AdminApp from "./AdminApp.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import "./index.css";

// Admin dashboard entrypoint. Served only at the secret /${ADMIN_PATH} route
// (see server/index.js) via admin.html, so AdminApp is bundled separately and
// never ships in the public homepage bundle. Access is gated server-side, so
// this renders AdminApp unconditionally.
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <AdminApp />
  </ErrorBoundary>,
);
