import type { ControllerAddress } from "../core/release";
import { createControllerClient, type ControllerClient } from "./client";

interface PageLocation {
  protocol: string;
  hostname: string;
}

export function resolveApiUrl(address: ControllerAddress, configuredUrl: string | undefined, page: PageLocation): string {
  const trimmed = configuredUrl?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, "");
  const protocol = page.protocol === "https:" ? "https:" : "http:";
  const basePath = address.basePath.replace(/\/+$/, "");
  return `${protocol}//${page.hostname || "localhost"}:${address.port}${basePath}`;
}

let sharedClient: ControllerClient | null = null;

export function getControllerClient(address: ControllerAddress): ControllerClient {
  sharedClient ??= createControllerClient(resolveApiUrl(address, import.meta.env.VITE_API_URL, window.location));
  return sharedClient;
}
