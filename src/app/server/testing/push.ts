// Push doubles for tests (S-195..S-200): a pusher that records what it would send, and admins
// with switches and subscribed devices. No network.
import type { TestDatabase } from "~/db/testing/pglite";
import type { PushDevice, PushOutcome, PushPayload, Pusher } from "~/server/push/push.server";
import { saveSubscription } from "~/server/push/subscriptions.server";
import { insertAdmin } from "./admins";
import { FakeAuth } from "./fake-auth";

export class RecordingPusher implements Pusher {
  sent: { device: PushDevice; payload: PushPayload }[] = [];
  constructor(private readonly outcome: PushOutcome = "sent") {}
  async send(device: PushDevice, payload: PushPayload) {
    this.sent.push({ device, payload });
    return { outcome: this.outcome, status: this.outcome === "sent" ? 201 : 500 };
  }
}

export interface AlertAdminOptions {
  locale?: "en" | "fr";
  push?: boolean;
  email?: boolean;
  active?: boolean;
  devices?: number;
}

/** An admin with alert switches and `devices` subscribed endpoints (`https://push.example.com/<id>/<n>`). */
export async function alertAdmin(database: TestDatabase, options: AlertAdminOptions = {}) {
  const row = await insertAdmin(database, new FakeAuth(), { locale: options.locale, active: options.active });
  await database.client.query("update admin set alert_push = $2, alert_email = $3 where id = $1", [row.id, options.push ?? true, options.email ?? true]);
  for (let i = 0; i < (options.devices ?? 1); i += 1) {
    await saveSubscription(database.db, row.id, { endpoint: `https://push.example.com/${row.id}/${i}`, keys: { p256dh: "k", auth: "a" } }, null);
  }
  return row;
}
