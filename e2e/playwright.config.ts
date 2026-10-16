import { defineConfig } from '@playwright/test';

// Run it with `pnpm e2e:isolated` (own database, deleted afterwards). The tests are destructive: helpers.ts refuses to
// start unless E2E_ALLOW_DESTRUCTIVE=1, and BASE_URL must then point at a stack you can throw away.
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: {
    ignoreHTTPSErrors: true,
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
});
