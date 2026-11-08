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
      // a brief typed on the website: start a fresh project and design it straight away
      const url = new URL(window.location.href);
      const brief = url.searchParams.get("brief")?.trim().slice(0, 300);
      if (brief) {
        url.searchParams.delete("brief");
        window.history.replaceState(null, "", url.pathname + url.search);
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
