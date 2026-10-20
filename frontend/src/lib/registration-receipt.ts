/** Input: successful registration response; Output: this tab's submission receipt, never authorization or live approval status. */
"use client";

import { useSyncExternalStore } from "react";

const KEY = "jiesong_registration_receipt";
const listeners = new Set<() => void>();
let memoryReceipt: string | null = null;

export type RegistrationReceipt = { email: string; submittedAt: string };

function readSnapshot() {
  try {
    return window.sessionStorage.getItem(KEY) ?? memoryReceipt;
  } catch {
    return memoryReceipt;
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function notify() {
  listeners.forEach((listener) => listener());
}

export function saveRegistrationReceipt(email: string) {
  memoryReceipt = JSON.stringify({
    email,
    submittedAt: new Date().toISOString(),
  });
  try {
    window.sessionStorage.setItem(KEY, memoryReceipt);
  } catch {
    /* Receipt still works in this mounted app. */
  }
  notify();
}
export function clearRegistrationReceipt() {
  memoryReceipt = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* No credential or approval state is stored here. */
  }
  notify();
}
export function useRegistrationReceipt(): RegistrationReceipt | null {
  const raw = useSyncExternalStore(subscribe, readSnapshot, () => null);
  if (!raw) return null;
  try {
    const receipt = JSON.parse(raw);
    return typeof receipt.email === "string" &&
      typeof receipt.submittedAt === "string"
      ? { email: receipt.email, submittedAt: receipt.submittedAt }
      : null;
  } catch {
    return null;
  }
}
