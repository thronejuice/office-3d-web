import { createSeedMap } from '@office3d/shared';
import { config } from './config';
import { connect, schema } from './db';
import { buildApp } from './app';
import { bootstrapAdmin, purgeExpiredSessions } from './auth';
import { attachRealtime } from './realtime';
import type { Hub } from './hub';

const db = await connect(config.databaseUrl);
if (!(await db.select().from(schema.mapVersions).limit(1)).length) {
  await db.insert(schema.mapVersions).values({ data: createSeedMap(), note: 'แผนที่เริ่มต้น' });
}
await bootstrapAdmin(db, config.initialAdminUsername, config.initialAdminPassword);

// Fastify must exist before Socket.IO can attach to its server; the hub is filled in right after.
let hub: Hub | undefined;
const proxy: Hub = {
  kick: (id, r) => hub?.kick(id, r),
  profileChanged: (id) => hub?.profileChanged(id) ?? Promise.resolve(),
  mapPublished: (m, v) => hub?.mapPublished(m, v),
};
const app = await buildApp(db, config, proxy);
await app.ready();
hub = await attachRealtime(app.server, db, config);
await app.listen({ port: config.port, host: '0.0.0.0' });
setInterval(() => void purgeExpiredSessions(db), 3600_000).unref();
