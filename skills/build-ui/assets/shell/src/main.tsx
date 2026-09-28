import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { release } from "./release";
import { configureSharedDatabase } from "./store/db";
import "./styles/index.css";

const rootElement = document.getElementById("root");

configureSharedDatabase(release.id);

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App release={release} />
    </StrictMode>,
  );
}
