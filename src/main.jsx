import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import UnsubscribeApp from "./UnsubscribeApp.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import "./index.css";

// The admin dashboard has its own entrypoint (admin.html → src/admin-main.jsx),
// served at the secret /${ADMIN_PATH} route, so AdminApp is bundled separately
// and never ships in this public bundle.
function getRootComponent() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "abmelden" && parts[1]) return <UnsubscribeApp />;
  return <App />;
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>{getRootComponent()}</ErrorBoundary>,
);
