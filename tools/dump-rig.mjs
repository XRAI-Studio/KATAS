// Dump the rig schema for the Blender avatar builder (tools/build-avatar.py),
// so the GLB skeleton is generated from the very table avatar.js and the
// ground clamp use. Run: node tools/dump-rig.mjs  -> tools/rig.json
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rigSchema, rigSchemaHash } from '../kata-viewer/js/rig-schema.js';
export { rigSchema, rigSchemaHash };

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('dump-rig.mjs')) {
  const schema = rigSchema();
  const out = { ...schema, schemaHash: rigSchemaHash(schema) };
  writeFileSync(join(here, 'rig.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`tools/rig.json written (schema ${out.schemaHash})`);
}
