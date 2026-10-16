const env = process.env;
const need = (k: string, fallback?: string) => {
  const v = env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var ${k}`);
  return v;
};

export const config = {
  port: Number(env.PORT ?? 3000),
  databaseUrl: need('DATABASE_URL', 'postgres://office:office@localhost:5432/office'),
  secureCookie: env.NODE_ENV === 'production' && env.INSECURE_COOKIES !== '1',
  initialAdminUsername: env.INITIAL_ADMIN_USERNAME ?? 'admin',
  initialAdminPassword: env.INITIAL_ADMIN_PASSWORD ?? '',
  turnHost: env.TURN_HOST ?? '', // empty = no TURN, STUN-less LAN only
  turnPort: Number(env.TURN_PORT ?? 3478),
  turnSecret: env.TURN_SECRET ?? '',
};
export type Config = typeof config;
