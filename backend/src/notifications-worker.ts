import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { NotificationDispatcher } from "./modules/notifications/notification-dispatcher";

export type NotificationsWorkerOptions = { limit: number; help: boolean };

export function parseNotificationsWorkerOptions(argv: string[]): NotificationsWorkerOptions {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true, limit: 0 };
  const limitArgument = argv.find((argument) => argument.startsWith("--limit="));
  const value = limitArgument?.slice("--limit=".length) ?? "20";
  if (!/^\d+$/.test(value)) throw new Error("NOTIFICATIONS_WORKER_LIMIT_INVALID");
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("NOTIFICATIONS_WORKER_LIMIT_INVALID");
  return { help: false, limit };
}

export async function runNotificationsWorker(dispatcher: Pick<NotificationDispatcher, "processNext">, limit: number): Promise<number> {
  let processed = 0;
  while (processed < limit) {
    const result = await dispatcher.processNext();
    if (result.status === "none") break;
    processed += 1;
  }
  return processed;
}

async function main(): Promise<void> {
  const options = parseNotificationsWorkerOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: notifications-worker [--limit=20]\nProcesses at most 1-100 pending notifications; --help sends nothing.\n");
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const processed = await runNotificationsWorker(app.get(NotificationDispatcher), options.limit);
    process.stdout.write(`${JSON.stringify({ processed, status: "completed" })}\n`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "NOTIFICATIONS_WORKER_FAILED"}\n`);
    process.exitCode = 1;
  });
}
