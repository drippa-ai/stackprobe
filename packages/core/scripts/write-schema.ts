import { writeFileSync } from 'node:fs';
import { reportJsonSchema } from '../src/report.ts';

const path = new URL('../../../schema/report.v1.json', import.meta.url);
writeFileSync(path, `${JSON.stringify(reportJsonSchema(), null, 2)}\n`);
console.log(`wrote ${path.pathname}`);
