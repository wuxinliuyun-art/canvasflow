const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');
function fixture(events) {
  let calls = 0;
  const context = { URL, Buffer, console: { warn() {} }, setTimeout: fn => fn(),
    AGTOKEN_BASE_URL: 'https://agtoken.vip',
    https: { request(options, callback) {
      const req = new EventEmitter();
      req.write = () => {};
      req.setTimeout = () => {};
      req.end = () => {
        const event = events[calls++];
        const socket = new EventEmitter();
        socket.connecting = true;
        socket.encrypted = true;
        req.emit('socket', socket);
        if (event !== 'handshake' && event !== 'certificate') socket.emit('secureConnect');
        if (event === 'ok' || event === 'aborted' || event === 'http503') {
          const res = new EventEmitter();
          res.statusCode = event === 'http503' ? 503 : 200;
          res.headers = {};
          callback(res);
          res.emit('data', Buffer.from('{}'));
          res.emit(event === 'aborted' ? 'aborted' : 'end');
        } else {
          req.emit('error', Object.assign(new Error('failure'), {
            code: event === 'certificate' ? 'CERT_HAS_EXPIRED' : 'ECONNRESET'
          }));
        }
      };
      return req;
    } }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function proxyRequest('), source.indexOf('async function tryProxyRequest(')), context);
  return { run: () => context.proxyRequest('POST', 'https://agtoken.vip/v1/images/edits', {}, '{}'), calls: () => calls };
}

test('handshake reset retries once and can recover', async () => {
  const f = fixture(['handshake', 'ok']);
  assert.equal((await f.run()).status, 200);
  assert.equal(f.calls(), 2);
});
test('repeated handshake resets stop after two attempts', async () => {
  const f = fixture(['handshake', 'handshake']);
  await assert.rejects(f.run(), /安全连接建立失败/);
  assert.equal(f.calls(), 2);
});
test('certificate failure does not retry', async () => {
  const f = fixture(['certificate']);
  await assert.rejects(f.run(), /CERT_HAS_EXPIRED/);
  assert.equal(f.calls(), 1);
});
test('post-handshake resets and partial responses never replay paid requests', async () => {
  for (const event of ['reset', 'aborted']) {
    const f = fixture([event]);
    await assert.rejects(f.run(), /任务结果未知/);
    assert.equal(f.calls(), 1);
  }
});
test('HTTP failures pass through without retry', async () => {
  const f = fixture(['http503']);
  assert.equal((await f.run()).status, 503);
  assert.equal(f.calls(), 1);
});
