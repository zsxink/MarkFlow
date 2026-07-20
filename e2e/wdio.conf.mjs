import path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(e2eDir, '..');
const artifactsDir = process.env.MARKFLOW_E2E_ARTIFACT_DIR
  ? path.resolve(process.env.MARKFLOW_E2E_ARTIFACT_DIR)
  : path.join(e2eDir, 'artifacts');
const appBinaryPath = process.env.MARKFLOW_E2E_BINARY
  ? path.resolve(process.env.MARKFLOW_E2E_BINARY)
  : path.join(projectRoot, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'markflow.exe' : 'markflow');

const appEnvironment = {
  MARKFLOW_E2E_DATA_DIR: process.env.MARKFLOW_E2E_DATA_DIR ?? '',
  MARKFLOW_E2E_WORKSPACE: process.env.MARKFLOW_E2E_WORKSPACE ?? '',
};

export const config = {
  runner: 'local',
  specs: ['./specs/**/*.e2e.mjs'],
  suites: {
    smoke: ['./specs/smoke/**/*.e2e.mjs'],
    regression: ['./specs/regression/**/*.e2e.mjs'],
  },
  maxInstances: 1,
  logLevel: process.env.CI ? 'info' : 'warn',
  outputDir: path.join(artifactsDir, 'wdio'),
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  services: [[
    'tauri',
    {
      appBinaryPath,
      driverProvider: 'embedded',
      embeddedPort: 4445,
      env: appEnvironment,
      captureBackendLogs: true,
      captureFrontendLogs: true,
      backendLogLevel: 'info',
      frontendLogLevel: 'warn',
      startTimeout: 60_000,
      statusPollTimeout: 10_000,
    },
  ]],
  capabilities: [{ browserName: 'tauri', maxInstances: 1 }],
  afterTest: async (_test, _context, { passed }) => {
    if (!passed) {
      await browser.saveScreenshot(path.join(artifactsDir, `failure-${Date.now()}.png`));
    }
  },
};
