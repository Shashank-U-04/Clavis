"use client";

/**
 * The design studio as one client-only island. It restores the last project (or starts the
 * welcome screen), checks whether the server has a hosted model, and renders the workspace.
 * Everything inside relies on the browser (local storage, WebGL), so the page loads it with
 * server rendering switched off.
 */

import { useEffect, useState } from "react";
import { App } from "./App";
import { projectActions, startProjects } from "./projects";
import { setUi } from "./uiStore";
import { sunsetLoftModel, templateModel } from "../model/templates";
import { assistant, session } from "../ai/session";
import { actions, store } from "../model/store";
import "./studio.css";

let started = false;

export default function StudioRoot() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!started) {
      started = true;
      startProjects();
      void assistant.checkHosted();
      // links from the website and the dashboard: ?brief=…, ?project=<id>, ?new=blank|describe|template|sunset
      const url = new URL(window.location.href);
      const brief = url.searchParams.get("brief")?.trim().slice(0, 300);
      const project = url.searchParams.get("project");
      const fresh = url.searchParams.get("new");
      if (brief || project || fresh) window.history.replaceState(null, "", url.pathname);
      if (project) projectActions.open(project);
      if (fresh === "blank" || fresh === "describe") projectActions.newBlank();
      if (fresh === "describe") setUi({ rightTab: "assistant", welcome: false });
      if (fresh === "template") projectActions.newFrom(templateModel(), "Started from the compact two-bedroom template (hand-made, not AI output).");
      if (fresh === "sunset") projectActions.newFrom(sunsetLoftModel(), "Opened the Sunset Loft showcase home.");
      if (brief) {
        projectActions.newBlank();
        setUi({ rightTab: "assistant", welcome: false });
        void assistant.ask(brief);
      }
      // a console handle for debugging and for the browser tests
      (window as unknown as { __clavis: unknown }).__clavis = { store, actions, session, assistant };
    }
    setReady(true);
  }, []);

  return <div className="studio">{ready ? <App /> : <div className="studio-loading">Opening the studio…</div>}</div>;
}
