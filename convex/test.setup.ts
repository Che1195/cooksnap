/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "./schema";

export const modules = import.meta.glob("./**/*.*s", { eager: false });

export function makeTest() {
  return convexTest(schema, modules);
}

export const ALICE = { subject: "user_alice", email: "alice@example.com", name: "Alice" };
export const BOB = { subject: "user_bob", email: "bob@example.com", name: "Bob" };
