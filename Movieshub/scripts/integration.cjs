const { spawnSync } = require('node:child_process');
const path = require('node:path');
const files = require('node:fs').readdirSync(path.join(__dirname,'../server/tests')).filter(name => name.endsWith('.test.js')).map(name => path.join(__dirname,'../server/tests',name));
const result = spawnSync(process.execPath,['--test',...files],{stdio:'inherit',env:{...process.env,RUN_MONGO_TESTS:'1'}});
process.exit(result.status ?? 1);
