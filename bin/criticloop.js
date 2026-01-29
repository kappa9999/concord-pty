#!/usr/bin/env node
require('../src/index').main(process.argv).catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
