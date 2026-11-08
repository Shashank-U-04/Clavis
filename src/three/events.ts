/**
 * Commands that cross from the page chrome into a view without going through the design
 * store: "export the 3D model", "fit the plan", "open every door". Views subscribe while
 * mounted; nothing is queued for views that are not.
 */

export interface ViewCommands {
  "export-obj": undefined;
  "export-png": undefined;
  "fit-3d": undefined;
  "fit-plan": undefined;
  doors: { state: "open" | "closed" | "toggle"; id?: string };
}

type Name = keyof ViewCommands;
type Listener<N extends Name> = (payload: ViewCommands[N]) => void;

const channel = new EventTarget();

/** Listen for a command; returns the function that stops listening. */
export function onCommand<N extends Name>(name: N, listener: Listener<N>): () => void {
  const wrapped = (e: Event) => listener((e as CustomEvent<ViewCommands[N]>).detail);
  channel.addEventListener(name, wrapped);
  return () => channel.removeEventListener(name, wrapped);
}

export function sendCommand<N extends Name>(name: N, ...payload: ViewCommands[N] extends undefined ? [] : [ViewCommands[N]]): void {
  channel.dispatchEvent(new CustomEvent(name, { detail: payload[0] }));
}
