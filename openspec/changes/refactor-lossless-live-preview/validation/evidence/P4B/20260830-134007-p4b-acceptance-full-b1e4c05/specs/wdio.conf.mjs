// P4B independent human-acceptance harness. Lives in /tmp on purpose: the
// acceptance delegate must not touch e2e/** in the repo.
//
// It reuses the repo's WebDriver/Tauri service configuration verbatim except
// for: spec location, artifact output, mocha timeout, and the isolated
// E2E data/workspace directories.

const projectRoot = '/Users/xian/Project/book/MarkFlow';

export const config = {
  runner: 'local',
  specs: ['/tmp/p4b-acc/specs/*.e2e.mjs'],
  maxInstances: 1,
  logLevel: 'warn',
  outputDir: '/tmp/p4b-acc/out',
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: Number(process.env.P4B_ACC_TIMEOUT ?? 180_000),
  },
  services: [[
    'tauri',
    {
      appBinaryPath: `${projectRoot}/src-tauri/target/debug/markflow`,
      driverProvider: 'embedded',
      embeddedPort: 4445,
      env: {
        MARKFLOW_E2E_DATA_DIR: '/tmp/p4b-acc/data',
        MARKFLOW_E2E_WORKSPACE: '/tmp/p4b-acc/ws',
      },
      captureBackendLogs: true,
      captureFrontendLogs: true,
      backendLogLevel: 'info',
      frontendLogLevel: 'warn',
      startTimeout: 120_000,
      statusPollTimeout: 10_000,
    },
  ]],
  capabilities: [{ browserName: 'tauri', maxInstances: 1 }],
};
