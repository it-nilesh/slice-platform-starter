#!/usr/bin/env node
// slice: the platform CLI for vertical slices (microservice + microfrontend).
//
// Scaffolding (repo changes, committed via PR):
//   create <name>      generate API, tests, MFE, CI pipeline, compose services, dev ports
//   ci <name>|--all    (re)generate slice pipelines from the current template
//   remove <name>      delete a generated slice (requires --yes)
//
// Runtime registration (deploy-time config, applied at the gateway):
//   register <name>    add to the MFE manifest + gateway allowlist
//   unregister <name>  remove from both
//   enable|disable     flip the manifest kill switch
//
//   list               show every slice and its state
//
// Node built-ins only: runs anywhere Node >= 22 is installed.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEMPLATES = fileURLToPath(new URL('./templates/', import.meta.url));

const FILES = {
  manifest: 'gateway/config/mfe-manifest.json',
  allowlist: 'gateway/conf.d/allowlist.conf',
  devServers: 'frontend/mfe-dev-servers.json',
  compose: 'docker-compose.yml',
  solution: 'backend/MicroFrontendPoC.slnx',
  codeowners: '.github/CODEOWNERS',
  validator: 'frontend/scripts/validate-manifest.ts',
};

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const MAX_NAME = 30;
const RESERVED = new Set(['shell', 'gateway', 'api', 'mfe', 'config', 'assets', 'healthz', 'contracts', 'tools']);
const FIRST_MFE_PORT = 3001;
const FIRST_API_PORT = 5101;

// ---------------------------------------------------------------- output

const isTTY = process.stdout.isTTY;
const paint = (code) => (s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = paint(32);
const yellow = paint(33);
const red = paint(31);
const dim = paint(2);
const bold = paint(1);

class CliError extends Error {}

const log = (msg = '') => console.log(msg);
const step = (msg) => log(`${green('✓')} ${msg}`);
const warn = (msg) => log(`${yellow('!')} ${msg}`);

// ---------------------------------------------------------------- helpers

const abs = (p) => join(ROOT, p);
const read = (p) => readFileSync(abs(p), 'utf8');
// writeFileSync truncates in place (same inode), so bind-mounted files stay in sync.
const write = (p, content) => writeFileSync(abs(p), content);
const readJson = (p) => JSON.parse(read(p));
const writeJson = (p, value) => write(p, `${JSON.stringify(value, null, 2)}\n`);

function sliceNames(name, label) {
  const pascal = name
    .split('-')
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
  return {
    name,
    pascal,
    upper: name.toUpperCase().replaceAll('-', '_'),
    label: label ?? name.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(' '),
  };
}

function slicePaths(n) {
  return {
    api: `backend/src/Services/${n.pascal}`,
    apiProject: `backend/src/Services/${n.pascal}/${n.pascal}.Api/${n.pascal}.Api.csproj`,
    tests: `backend/tests/${n.pascal}.Api.Tests`,
    testProject: `backend/tests/${n.pascal}.Api.Tests/${n.pascal}.Api.Tests.csproj`,
    mfe: `frontend/apps/mfe-${n.name}`,
    workflow: `.github/workflows/slice-${n.name}.yml`,
  };
}

const BUILD_OUTPUT = new Set(['bin', 'obj', 'node_modules', 'dist']);

/** True if the path holds real source. Leftover build output (e.g. an IDE rebuilding obj/) doesn't count. */
function hasContent(path) {
  if (!existsSync(abs(path))) return false;
  if (!statSync(abs(path)).isDirectory()) return true;
  return readdirSync(abs(path)).some((entry) => !BUILD_OUTPUT.has(entry) && hasContent(join(path, entry)));
}

function validateName(name) {
  if (!name) throw new CliError('A slice name is required, e.g. `./slice create inventory`.');
  if (!NAME_RE.test(name) || name.length > MAX_NAME) {
    throw new CliError(`Invalid name "${name}". Use lowercase letters, digits and single hyphens (max ${MAX_NAME}).`);
  }
  if (RESERVED.has(name)) throw new CliError(`"${name}" is reserved by the platform.`);
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', ...options });
}

function hasCommand(cmd) {
  try {
    run(cmd, ['--version']);
    return true;
  } catch {
    return false;
  }
}

/** Renders every template file whose output path passes `filter`. Returns the written paths. */
function render(tokens, { filter = () => true, overwrite = false } = {}) {
  const written = [];
  const replace = (s) => Object.entries(tokens).reduce((acc, [k, v]) => acc.replaceAll(k, String(v)), s);

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const src = join(dir, entry);
      if (statSync(src).isDirectory()) {
        walk(src);
        continue;
      }
      const target = replace(relative(TEMPLATES, src).split(sep).join('/')).replace(/\.tmpl$/, '');
      if (!filter(target)) continue;
      if (existsSync(abs(target)) && !overwrite) throw new CliError(`Refusing to overwrite ${target}`);
      mkdirSync(dirname(abs(target)), { recursive: true });
      write(target, replace(readFileSync(src, 'utf8')));
      written.push(target);
    }
  };
  walk(TEMPLATES);
  return written;
}

function tokensFor(n, ports) {
  return {
    __NAME__: n.name,
    __PASCAL__: n.pascal,
    __UPPER__: n.upper,
    __LABEL__: n.label,
    __API_PORT__: ports.api,
    __MFE_PORT__: ports.mfe,
  };
}

function portOf(url) {
  return Number(new URL(url).port);
}

function devPorts(name) {
  const dev = readJson(FILES.devServers);
  if (dev.remotes[name] && dev.apis[name]) {
    return { mfe: portOf(dev.remotes[name]), api: portOf(dev.apis[name]) };
  }
  return null;
}

/** All slice names known anywhere in the repo or runtime config. */
function knownSlices() {
  const names = new Set();
  for (const d of readdirSync(abs('frontend/apps'))) if (d.startsWith('mfe-')) names.add(d.slice(4));
  for (const r of readJson(FILES.manifest).remotes) names.add(r.name);
  for (const name of allowlisted('mfe_name')) names.add(name);
  return [...names].sort();
}

// ---------------------------------------------------------------- allowlist

const MAP_VARIABLES = ['mfe_name', 'svc_name'];

function mapBlock(conf, variable) {
  const re = new RegExp(`(map\\s+\\$${variable}\\s+\\$\\w+\\s*\\{)([^}]*)(\\})`);
  const match = re.exec(conf);
  if (!match) throw new CliError(`Could not find "map $${variable}" in ${FILES.allowlist}`);
  return { re, match };
}

function allowlisted(variable) {
  const { match } = mapBlock(read(FILES.allowlist), variable);
  return match[2]
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim().match(/^([a-z][a-z0-9-]*)\s+1;$/)?.[1])
    .filter(Boolean);
}

function setAllowlisted(name, allowed) {
  let conf = read(FILES.allowlist);
  for (const variable of MAP_VARIABLES) {
    const { re, match } = mapBlock(conf, variable);
    const lines = match[2].split('\n').filter((l) => !new RegExp(`^\\s*${name}\\s+1;`).test(l));
    if (allowed) {
      const width = Math.max(8, name.length + 1);
      lines.splice(lines.length - 1, 0, `    ${name.padEnd(width)} 1;`);
    }
    conf = conf.replace(re, `$1${lines.join('\n')}$3`);
  }
  write(FILES.allowlist, conf);
}

// ---------------------------------------------------------------- compose / solution / codeowners

const composeMarkers = (name) => [`  # --- slice: ${name} (generated by ./slice) ---`, `  # --- end slice: ${name} ---`];

function addComposeServices(n) {
  const [start, end] = composeMarkers(n.name);
  const block = `${start}
  ${n.name}-api:
    <<: *api-defaults
    build:
      context: ./backend
      dockerfile: src/Services/${n.pascal}/${n.pascal}.Api/Dockerfile
    image: mfe-poc/${n.name}-api:\${TAG:-local}

  mfe-${n.name}:
    <<: *web-defaults
    build:
      context: ./frontend
      args: { APP: mfe-${n.name}, PUBLIC_PATH: /mfe/${n.name}, NGINX_CONF: remote.conf }
    image: mfe-poc/mfe-${n.name}:\${TAG:-local}
${end}

`;
  const compose = read(FILES.compose);
  if (compose.includes(start)) return false;
  const idx = compose.search(/^networks:/m);
  if (idx === -1) throw new CliError(`Could not find top-level "networks:" in ${FILES.compose}`);
  write(FILES.compose, compose.slice(0, idx).replace(/\n*$/, '\n\n') + block + compose.slice(idx));
  return true;
}

function removeComposeServices(name) {
  const [start, end] = composeMarkers(name);
  const compose = read(FILES.compose);
  const from = compose.indexOf(start);
  const to = compose.indexOf(end);
  if (from === -1 || to === -1) return false;
  write(FILES.compose, compose.slice(0, from).replace(/\n+$/, '\n\n') + compose.slice(to + end.length).replace(/^\n+/, ''));
  return true;
}

function addCodeowners(n, owner) {
  const p = slicePaths(n);
  const block = [
    `# slice: ${n.name}`,
    `/${p.api}/ ${owner}`,
    `/${p.tests}/ ${owner}`,
    `/${p.mfe}/ ${owner}`,
    `/${p.workflow} ${owner}`,
    '',
  ].join('\n');
  const current = existsSync(abs(FILES.codeowners)) ? read(FILES.codeowners) : '';
  write(FILES.codeowners, `${current.replace(/\n*$/, current ? '\n\n' : '')}${block}`);
}

function removeCodeowners(name) {
  if (!existsSync(abs(FILES.codeowners))) return;
  const re = new RegExp(`\\n*# slice: ${name}\\n(?:[^\\n]+\\n)*`, 'g');
  write(FILES.codeowners, read(FILES.codeowners).replace(re, '\n').replace(/^\n+/, ''));
}

function dotnetSln(action, ...projects) {
  if (!hasCommand('dotnet')) {
    warn(`dotnet not found: run \`dotnet sln ${FILES.solution} ${action} ${projects.join(' ')}\` manually`);
    return;
  }
  run('dotnet', ['sln', FILES.solution, action, ...projects]);
}

/** npm keeps lockfile entries for deleted workspaces (marked extraneous); drop them explicitly. */
function pruneLockfile(name) {
  const lockPath = 'frontend/package-lock.json';
  const lock = readJson(lockPath);
  for (const key of [`apps/mfe-${name}`, `node_modules/mfe-${name}`]) delete lock.packages?.[key];
  writeJson(lockPath, lock);
}

function npmInstall() {
  log(dim('  npm install (updates the workspace lockfile)…'));
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: abs('frontend') });
}

// ---------------------------------------------------------------- manifest

function validateRuntimeConfig() {
  try {
    run(process.execPath, [FILES.validator, FILES.manifest, FILES.allowlist]);
  } catch (err) {
    throw new CliError(`Runtime config is invalid:\n${err.stderr || err.message}`);
  }
}

/** Applies a change to manifest + allowlist atomically: rolled back if validation fails. */
function withRuntimeConfig(change) {
  const backup = { manifest: read(FILES.manifest), allowlist: read(FILES.allowlist) };
  try {
    change();
    validateRuntimeConfig();
  } catch (err) {
    write(FILES.manifest, backup.manifest);
    write(FILES.allowlist, backup.allowlist);
    throw err;
  }
}

function reloadGateway(reload) {
  const cmd = `docker compose exec -T gateway sh -c 'nginx -t && nginx -s reload'`;
  if (!reload) {
    log(`\nApply the allowlist change at the gateway (zero downtime):\n  ${bold(cmd)}`);
    log(dim('  (the manifest itself needs no reload; it is served no-cache)'));
    return;
  }
  try {
    run('docker', ['compose', 'exec', '-T', 'gateway', 'sh', '-c', 'nginx -t && nginx -s reload']);
    step('Gateway reloaded');
  } catch (err) {
    warn(`Gateway reload failed (is the stack running?). Run manually:\n  ${cmd}\n${dim(err.stderr ?? '')}`);
  }
}

// ---------------------------------------------------------------- commands

function create(name, opts) {
  validateName(name);
  const n = sliceNames(name, opts.label);
  const p = slicePaths(n);
  for (const path of [p.api, p.tests, p.mfe, p.workflow]) {
    if (hasContent(path)) throw new CliError(`${path} already exists.`);
    rmSync(abs(path), { recursive: true, force: true }); // stale build output only
  }

  const dev = readJson(FILES.devServers);
  const ports = {
    mfe: Math.max(FIRST_MFE_PORT - 1, ...Object.values(dev.remotes).map(portOf)) + 1,
    api: Math.max(FIRST_API_PORT - 1, ...Object.values(dev.apis).map(portOf)) + 1,
  };

  log(bold(`Creating slice "${n.name}"`) + dim(` (label "${n.label}", dev ports mfe:${ports.mfe} api:${ports.api})`));

  const written = render(tokensFor(n, ports));
  step(`Generated ${written.length} files from tools/slice/templates`);

  dotnetSln('add', p.apiProject, p.testProject);
  step(`Added projects to ${FILES.solution}`);

  dev.remotes[n.name] = `http://localhost:${ports.mfe}`;
  dev.apis[n.name] = `http://localhost:${ports.api}`;
  writeJson(FILES.devServers, dev);
  step(`Registered dev ports in ${FILES.devServers}`);

  addComposeServices(n);
  step(`Added ${n.name}-api and mfe-${n.name} to ${FILES.compose}`);

  if (opts.owner) {
    addCodeowners(n, opts.owner);
    step(`Assigned ownership to ${opts.owner} in ${FILES.codeowners}`);
  }

  if (!opts['no-install']) {
    npmInstall();
    step('Linked the new workspace');
  }

  log(`
${bold('Next steps')}
  1. Build it:        ${dim(`cd backend && dotnet test   ·   cd frontend && npm run build -w mfe-${n.name}`)}
  2. Commit + PR:     the ${dim(`slice: ${n.name}`)} pipeline builds, scans and pushes both images
  3. Deploy:          ${dim(`docker compose up -d --build --no-deps ${n.name}-api mfe-${n.name}`)}
  4. Go live:         ${dim(`./slice register ${n.name} --reload`)}   (no shell redeploy)
  5. Release:         ${dim(`git tag ${n.name}-v1.0.0 && git push --tags`)}`);
}

function ci(name, opts) {
  const names = opts.all ? readdirSync(abs('frontend/apps')).filter((d) => d.startsWith('mfe-')).map((d) => d.slice(4)) : [name];
  if (!opts.all) validateName(name);
  for (const sliceName of names) {
    const n = sliceNames(sliceName);
    const ports = devPorts(sliceName) ?? { mfe: 0, api: 0 };
    const [file] = render(tokensFor(n, ports), {
      filter: (target) => target === slicePaths(n).workflow,
      overwrite: true,
    });
    step(`Generated ${file}`);
  }
}

function register(name, opts) {
  validateName(name);
  const n = sliceNames(name, opts.label);
  withRuntimeConfig(() => {
    const manifest = readJson(FILES.manifest);
    if (manifest.remotes.some((r) => r.name === name)) throw new CliError(`"${name}" is already registered.`);
    const order = opts.order !== undefined ? Number(opts.order) : Math.max(0, ...manifest.remotes.map((r) => r.nav?.order ?? 0)) + 10;
    manifest.remotes.push({
      name,
      entry: `/mfe/${name}/remoteEntry.js`,
      route: opts.route ?? `/${name}`,
      nav: { label: n.label, order },
    });
    writeJson(FILES.manifest, manifest);
    setAllowlisted(name, true);
  });
  step(`Registered "${name}" in ${FILES.manifest} and ${FILES.allowlist}`);
  reloadGateway(opts.reload);
}

function unregister(name, opts) {
  validateName(name);
  withRuntimeConfig(() => {
    const manifest = readJson(FILES.manifest);
    manifest.remotes = manifest.remotes.filter((r) => r.name !== name);
    writeJson(FILES.manifest, manifest);
    setAllowlisted(name, false);
  });
  step(`Unregistered "${name}" (manifest + allowlist)`);
  reloadGateway(opts.reload);
}

function setEnabled(name, enabled) {
  validateName(name);
  withRuntimeConfig(() => {
    const manifest = readJson(FILES.manifest);
    const remote = manifest.remotes.find((r) => r.name === name);
    if (!remote) throw new CliError(`"${name}" is not registered.`);
    if (enabled) delete remote.enabled;
    else remote.enabled = false;
    writeJson(FILES.manifest, manifest);
  });
  step(`${enabled ? 'Enabled' : 'Disabled'} "${name}". Takes effect on the next page load; no reload needed.`);
}

function remove(name, opts) {
  validateName(name);
  const n = sliceNames(name);
  const p = slicePaths(n);
  if (!opts.yes) {
    throw new CliError(
      `This deletes ${p.api}, ${p.tests}, ${p.mfe} and ${p.workflow}.\nRe-run with --yes to confirm.`,
    );
  }
  if (readJson(FILES.manifest).remotes.some((r) => r.name === name)) unregister(name, opts);

  if (existsSync(abs(p.apiProject))) dotnetSln('remove', p.apiProject, p.testProject);
  for (const path of [p.api, p.tests, p.mfe, p.workflow]) rmSync(abs(path), { recursive: true, force: true });
  step('Deleted generated files');

  const dev = readJson(FILES.devServers);
  delete dev.remotes[name];
  delete dev.apis[name];
  writeJson(FILES.devServers, dev);

  if (!removeComposeServices(name)) warn(`No generated block for "${name}" in ${FILES.compose}; edit it manually.`);
  removeCodeowners(name);
  pruneLockfile(name);
  if (!opts['no-install']) npmInstall();
  step(`Removed slice "${name}"`);
}

function list() {
  const manifest = readJson(FILES.manifest);
  const mfeAllowed = new Set(allowlisted('mfe_name'));
  const apiAllowed = new Set(allowlisted('svc_name'));
  const rows = knownSlices().map((name) => {
    const p = slicePaths(sliceNames(name));
    const remote = manifest.remotes.find((r) => r.name === name);
    const state = !remote ? dim('not registered') : remote.enabled === false ? yellow('disabled') : green('live');
    const mark = (ok) => (ok ? green('✓') : red('✗'));
    return [
      name,
      mark(hasContent(p.api)),
      mark(hasContent(p.mfe)),
      mark(existsSync(abs(p.workflow))),
      mark(mfeAllowed.has(name) && apiAllowed.has(name)),
      state,
      remote?.route ?? '',
    ];
  });
  const header = ['SLICE', 'API', 'MFE', 'CI', 'ALLOWED', 'STATE', 'ROUTE'];
  const strip = (s) => s.replace(/\x1b\[\d+m/g, '');
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => strip(r[i]).length)));
  const fmt = (r) => r.map((c, i) => c + ' '.repeat(widths[i] - strip(c).length)).join('  ');
  log(bold(fmt(header)));
  rows.forEach((r) => log(fmt(r)));
}

const HELP = `${bold('slice')}: vertical slice platform CLI

${bold('Scaffold')} (repo changes; commit them)
  ./slice create <name> [--label "Text"] [--owner @org/team] [--no-install]
  ./slice ci <name> | --all          regenerate pipelines from the template
  ./slice remove <name> --yes        delete a generated slice

${bold('Runtime')} (deploy-time config; no shell redeploy)
  ./slice register <name> [--label "Text"] [--route /path] [--order N] [--reload]
  ./slice unregister <name> [--reload]
  ./slice enable <name>  |  ./slice disable <name>

  ./slice list

Names: lowercase letters, digits and single hyphens, e.g. "inventory", "loyalty-points".`;

// ---------------------------------------------------------------- main

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    label: { type: 'string' },
    owner: { type: 'string' },
    route: { type: 'string' },
    order: { type: 'string' },
    reload: { type: 'boolean' },
    all: { type: 'boolean' },
    yes: { type: 'boolean' },
    'no-install': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

const [command, name] = positionals;
const commands = {
  create: () => create(name, values),
  ci: () => ci(name, values),
  remove: () => remove(name, values),
  register: () => register(name, values),
  unregister: () => unregister(name, values),
  enable: () => setEnabled(name, true),
  disable: () => setEnabled(name, false),
  list: () => list(),
};

try {
  if (!command || values.help || !commands[command]) {
    log(HELP);
    process.exit(command && !values.help ? 1 : 0);
  }
  commands[command]();
} catch (err) {
  if (err instanceof CliError) {
    console.error(`${red('✗')} ${err.message}`);
    process.exit(1);
  }
  throw err;
}
