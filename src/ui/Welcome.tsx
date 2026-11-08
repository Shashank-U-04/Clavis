import { useState } from "react";
import { assistant, useSession } from "../ai/session";
import { actions } from "../model/store";
import { projectActions } from "../app/projects";
import { templateModel } from "../model/templates";
import { setUi } from "./uiStore";

const IDEAS = [
  "A two-bedroom flat with an open kitchen, about 70 m²",
  "Three-bedroom family house with two bathrooms and a study",
  "A studio apartment, 40 m²",
];

/** Empty-plan state: start from a sentence, a template or a blank sheet. */
export function Welcome() {
  const [text, setText] = useState("");
  const busy = useSession((s) => s.busy);
  const go = (t: string) => {
    if (!t.trim() || busy) return;
    setUi({ rightTab: "assistant", welcome: false });
    void assistant.ask(t);
  };
  return (
    <div className="welcome" data-testid="welcome">
      <h1>Describe a home.</h1>
      <p>Clavis lays it out in metres, checks every wall, door, window and piece of furniture, and lets you walk through it in 3D.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
      >
        <input autoFocus value={text} maxLength={2000} placeholder="e.g. a three-bedroom house with a study, 110 m²" onChange={(e) => setText(e.target.value)} aria-label="Describe a home" />
        <button className="primary" disabled={busy || !text.trim()}>
          Design it
        </button>
      </form>
      <div className="ideas">
        {IDEAS.map((i) => (
          <button key={i} className="chip" onClick={() => go(i)} disabled={busy}>
            {i}
          </button>
        ))}
      </div>
      <div className="or">
        <button onClick={() => projectActions.newFrom(templateModel(), "Started from the compact two-bedroom template (hand-made, not AI output).")}>Start from a template</button>
        <button
          onClick={() => {
            setUi({ welcome: false });
            actions.setDrawMode("wall");
          }}
        >
          Draw walls by hand
        </button>
      </div>
      <p className="fine">Runs entirely in your browser. No account, no API key.</p>
    </div>
  );
}
