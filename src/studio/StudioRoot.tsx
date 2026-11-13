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
import { findTemplate, makerText } from "../lib/catalogue";
import { buildTemplate } from "../lib/buildTemplate";
import { assistant, session } from "../ai/session";
import { actions, store } from "../model/store";
import "./studio.css";

let started = false;

export default function StudioRoot() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!started) {
      started = true;
      const asked = /[?&](brief|project|new|template)=/.test(window.location.search);
      startProjects({ quiet: asked });
      void assistant.checkHosted();
      // links from the website and the app:
      //   ?project=<id>        open a plan (the app's /new creates it first, then links here)
      //   ?template=<slug>     start a plan from a catalogue template
      //   ?brief=…             start a plan by describing it
      //   ?new=blank|describe  start an empty plan; ?new=template|sunset are kept for old links
      //   ?name=…              the name for a plan started from a template or a blank sheet
      const url = new URL(window.location.href);
      const brief = url.searchParams.get("brief")?.trim().slice(0, 300);
      const project = url.searchParams.get("project");
      const fresh = url.searchParams.get("new");
      const name = url.searchParams.get("name")?.trim().slice(0, 80) || undefined;
      const tpl = url.searchParams.get("template") ?? (fresh === "template" ? "compact-two-bedroom" : fresh === "sunset" ? "sunset-loft" : null);
      if (brief || project || fresh || tpl) window.history.replaceState(null, "", url.pathname);
      if (project) projectActions.open(project);
      if (fresh === "blank" || fresh === "describe") projectActions.newBlank(fresh, name);
      if (fresh === "describe") setUi({ rightTab: "assistant", welcome: false });
      const entry = findTemplate(tpl);
      if (entry) projectActions.newFrom({ ...buildTemplate(entry.slug), ...(name && { name }) }, `Started from the ${entry.name} template (${makerText(entry.maker).toLowerCase()}, not AI output).`, `template:${entry.slug}`);
      if (brief) {
        projectActions.newBlank("describe");
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
