import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { store, actions } from "./model/store";
import { startProjects } from "./app/projects";
import { session, assistant } from "./ai/session";
import "./styles.css";

// Restore the last open project before the first paint (no undo entry), then autosave.
startProjects();
void assistant.checkHosted();

// Console hook for testing and debugging: the same pipelines the UI and agents use.
(window as unknown as { __clavis: unknown }).__clavis = { store, actions, session, assistant };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
