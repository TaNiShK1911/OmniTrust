import { createServerFn } from "@tanstack/react-start";

export const ensureDemoUser = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureDemoAccount } = await import("./demo.server");
  return ensureDemoAccount();
});
