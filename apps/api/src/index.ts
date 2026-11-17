import mongoose from 'mongoose';
import { cfg } from './config.ts';
import { build } from './server.ts';

await mongoose.connect(cfg.mongo);
await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes())); // creates unique/compound/TTL indexes
const app = await build();
await app.listen({ port: cfg.port, host: '0.0.0.0' });
