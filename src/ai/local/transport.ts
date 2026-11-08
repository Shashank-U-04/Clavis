/** The local engine as a workflow transport: same contract as POST /api/assistant, no network. */

import { store } from "../../model/store";
import type { Transport } from "../workflow";
import { localRespond } from "./engine";

export const localTransport: Transport = async (req) => {
  // yield once so the UI can paint its "thinking" state before the (synchronous) search runs
  await new Promise((r) => setTimeout(r, 0));
  return localRespond(req, store.getState().model);
};
