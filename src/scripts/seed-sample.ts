// Inserts the sample product (S-011). Never in production:
//   APP_ENV=staging DATABASE_URL=… npm run seed:sample
import { createRequestDb } from "../app/server/db.server";
import { SeedSampleRefused, seedSample } from "../app/server/services/seed-sample.server";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const requestDb = createRequestDb(url);
try {
  const outcome = await seedSample(requestDb.db, process.env.APP_ENV);
  console.log(outcome === "created" ? "Sample product created." : "Sample product already present.");
} catch (error) {
  console.error(error instanceof SeedSampleRefused ? error.message : "seed:sample failed.");
  process.exitCode = 1;
} finally {
  await requestDb.close();
}
