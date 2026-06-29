'use strict';
/**
 * JSON-structured logger. Output is one line per record.
 * Production-friendly: no colors, structured, timestamped.
 */
function makeLog(level = 'info') {
  return function log(event, fields = {}) {
    if (process.env.NODE_ENV === 'production' && level === 'debug') return;
    const record = {
      ts: new Date().toISOString(),
      level,
      event,
      ...fields,
    };
    const out = level === 'error' ? process.stderr : process.stdout;
    out.write(JSON.stringify(record) + '\n');
  };
}

module.exports = {
  debug: makeLog('debug'),
  info: makeLog('info'),
  warn: makeLog('warn'),
  error: makeLog('error'),
};
