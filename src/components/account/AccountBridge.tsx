"use client";

import { useEffect } from "react";
import { startAccountBridge } from "@/lib/account/bridge";

/** Mounted once in the root layout: keeps the session, the workspace and the cloud in step. */
export function AccountBridge() {
  useEffect(() => startAccountBridge(), []);
  return null;
}
