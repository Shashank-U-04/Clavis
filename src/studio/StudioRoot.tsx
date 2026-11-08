"use client";

/**
 * The design studio as one client-only island. It restores the last project (or starts the
 * welcome screen), checks whether the server has a hosted model, and renders the workspace.
 * Everything inside relies on the browser (local storage, WebGL), so the page loads it with
 * server rendering switched off.
 */

import { useEffect, useState } from "react";
import { App } from "./App";
import { startProjects } from "./projects";
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
      // a console handle for debugging and for the browser tests
      (window as unknown as { __clavis: unknown }).__clavis = { store, actions, session, assistant };
    }
    setReady(true);
  }, []);

  return <div className="studio">{ready ? <App /> : <div className="studio-loading">Opening the studio…</div>}</div>;
}
