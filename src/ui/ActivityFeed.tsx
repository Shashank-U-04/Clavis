import { useEffect, useRef } from "react";
import { useAppStore } from "../model/store";
import type { ActorSource } from "../model/types";

const WHO: Record<ActorSource, string> = { human: "YOU", assistant: "AI", system: "APP" };
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Everything that changed the design, newest at the bottom. */
export function ActivityFeed() {
  const entries = useAppStore((s) => s.activity);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  if (entries.length === 0) return <p className="activity-empty">Changes you and the assistant make will be listed here.</p>;
  return (
    <ol className="activity-feed" ref={list}>
      {entries.map((e) => (
        <li key={e.id} className={`activity-row ${e.source}${e.ok ? "" : " failed"}`}>
          <span className={`activity-badge ${e.source}`}>{WHO[e.source]}</span>
          <span className="activity-tool">{e.tool}</span>
          <span className="activity-summary">{e.summary}</span>
          <time className="activity-time">{time(e.at)}</time>
        </li>
      ))}
    </ol>
  );
}
