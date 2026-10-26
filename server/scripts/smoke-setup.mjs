// 首次启动引导 — 端到端验收脚本。
// 自包含:在临时数据目录上启动独立 API 实例,验证引导状态、字段校验、
// 一次性管理员创建、入口关闭与重启后的持久化。
// 用法: node server/scripts/smoke-setup.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'index.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-setup-'));
const port = 41000 + Math.floor(Math.random() * 4000);
const base = `http://127.0.0.1:${port}`;

const env = { ...process.env, PORT: String(port), NAILONG_DATA_DIR: dataDir };
// The test must start from a genuinely fresh install.
delete env.ADMIN_PASSWORD;

let child = null;
let serverLog = '';
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/api${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function startServer() {
  serverLog = '';
  child = spawn(process.execPath, [serverEntry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => {
    serverLog += chunk;
  });
  child.stderr.on('data', (chunk) => {
    serverLog += chunk;
  });
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${serverLog}`);
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start:\n${serverLog}`);
}

function stopServer() {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

const ADMIN = {
  username: 'root_admin',
  displayName: '站长',
  email: 'Root@Nailong.local',
  password: 'Nailong2026',
};

try {
  await startServer();

  let r = await api('/setup/status');
  check('首次启动状态可读', r.status === 200 && r.data.required === true && r.data.completedAt === null, JSON.stringify(r.data));

  r = await api('/setup/admin', { method: 'POST', body: {} });
  check('缺少必填字段被拒绝', r.status === 400 && r.data.code === 'VALIDATION_ERROR', JSON.stringify(r.data));

  r = await api('/setup/admin', { method: 'POST', body: { ...ADMIN, email: 'not-an-email' } });
  check('非法邮箱被拒绝', r.status === 400 && r.data.code === 'VALIDATION_ERROR', JSON.stringify(r.data));

  r = await api('/setup/admin', { method: 'POST', body: { ...ADMIN, password: 'abcdefgh' } });
  check('纯字母密码被拒绝', r.status === 400 && r.data.code === 'WEAK_PASSWORD', JSON.stringify(r.data));

  r = await api('/setup/admin', { method: 'POST', body: { ...ADMIN, password: '12345678' } });
  check('纯数字密码被拒绝', r.status === 400 && r.data.code === 'WEAK_PASSWORD', JSON.stringify(r.data));

  r = await api('/setup/admin', { method: 'POST', body: { ...ADMIN, username: 'a' } });
  check('非法用户名被拒绝', r.status === 400 && r.data.code === 'VALIDATION_ERROR', JSON.stringify(r.data));

  r = await api('/setup/admin', { method: 'POST', body: ADMIN });
  check('创建首位管理员', r.status === 201 && !!r.data.accessToken && r.data.user?.username === ADMIN.username, JSON.stringify(r.data));
  check(
    '管理员拥有 admin 角色与全部权限',
    r.data.user?.roles?.some((role) => role.key === 'admin') && r.data.user?.permissions?.includes('users:write'),
    JSON.stringify(r.data.user?.roles)
  );
  const adminToken = r.data.accessToken;

  r = await api('/setup/status');
  check('状态切换为已完成', r.status === 200 && r.data.required === false && typeof r.data.completedAt === 'string', JSON.stringify(r.data));

  r = await api('/setup/admin', {
    method: 'POST',
    body: { ...ADMIN, username: 'second_admin', email: 'second@nailong.local' },
  });
  check('引导入口关闭后再次提交被拒绝', r.status === 409 && r.data.code === 'SETUP_COMPLETE', JSON.stringify(r.data));

  r = await api('/auth/login', { method: 'POST', body: { username: ADMIN.username, password: ADMIN.password } });
  check('新管理员可以登录', r.status === 200 && !!r.data.accessToken, JSON.stringify(r.data));

  r = await api('/users', { token: adminToken });
  check('新管理员可访问受保护接口', r.status === 200 && r.data.items?.length === 1, JSON.stringify(r.data));

  r = await api('/auth/register', {
    method: 'POST',
    body: { username: 'islander', password: 'islander123', displayName: '岛民' },
  });
  check(
    '引导完成后普通注册不受影响',
    r.status === 201 && r.data.user?.roles?.some((role) => role.key === 'user'),
    JSON.stringify(r.data)
  );

  await stopServer();
  await new Promise((resolve) => setTimeout(resolve, 150));
  await startServer();

  r = await api('/setup/status');
  check('重启后引导仍保持关闭', r.status === 200 && r.data.required === false, JSON.stringify(r.data));
  r = await api('/setup/admin', { method: 'POST', body: { ...ADMIN, username: 'third_admin', email: 'third@nailong.local' } });
  check('重启后入口仍不可达', r.status === 409 && r.data.code === 'SETUP_COMPLETE', JSON.stringify(r.data));
} catch (err) {
  failures += 1;
  console.error(`FAIL  验收脚本异常: ${err.message}`);
  if (serverLog) console.error(serverLog);
} finally {
  await stopServer();
  await new Promise((resolve) => setTimeout(resolve, 150));
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the SQLite file briefly; temp dir is disposable.
  }
}

console.log(failures ? `\n${failures} 项检查失败` : '\n全部检查通过');
process.exitCode = failures ? 1 : 0;