import fs from "node:fs/promises";
import path from "node:path";
import { createHmac } from "node:crypto";
const [origin, profile] = process.argv.slice(2),
  root = process.env.PUBLISHER_KEY;
if (
  !root ||
  !/^[a-f0-9]{64}$/.test(root) ||
  !profile ||
  !/^[a-z0-9-]{1,48}$/.test(profile)
)
  throw Error(
    "Provide PUBLISHER_KEY in the environment and arguments: HTTPS_ORIGIN PROFILE_ID",
  );
const url = new URL(origin);
if (
  url.protocol !== "https:" ||
  url.pathname !== "/" ||
  url.username ||
  url.password
)
  throw Error("An HTTPS origin is required.");
const key = createHmac("sha256", root)
  .update("publisher:" + profile)
  .digest("hex");
await fs.mkdir("outputs", { recursive: true });
const file = path.resolve("outputs", profile + ".connection.json");
await fs.writeFile(
  file,
  JSON.stringify({ url: url.origin, profile, key }, null, 2),
  { flag: "wx", mode: 0o600 },
);
console.log(
  "Private connection file created in outputs. Give it only to the profile owner.",
);
