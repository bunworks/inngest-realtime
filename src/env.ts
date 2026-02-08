export type EnvValue = string | undefined;
export type Env = Record<string, EnvValue>;

export type ExpectedEnv = {
  BUNWORKS_DEV: string | undefined;
  NODE_ENV: string | undefined;
  BUNWORKS_BASE_URL: string | undefined;
  BUNWORKS_API_BASE_URL: string | undefined;
  BUNWORKS_SIGNING_KEY: string | undefined;
  BUNWORKS_SIGNING_KEY_FALLBACK: string | undefined;
};

/**
 * The environment variables that we wish to access in the environment.
 *
 * Due to the way that some environment variables are exposed across different
 * runtimes and bundling tools, we need to be careful about how we access them.
 *
 * The most basic annoyance is that environment variables are exposed in
 * different locations (e.g. `process.env`, `Deno.env`, `Netlify.env`,
 * `import.meta.env`).
 *
 * Bundling can be more disruptive though, where some will literally
 * find/replace `process.env.MY_VAR` with the value of `MY_VAR` at build time,
 * which requires us to ensure that the full env var is used in code instead of
 * dynamically building it.
 */
const env: ExpectedEnv | undefined = (() => {
  // Pure vite
  try {
    // @ts-expect-error - import.meta only available in some environments
    const viteEnv = import.meta.env;

    if (viteEnv) {
      return {
        BUNWORKS_DEV: viteEnv.BUNWORKS_DEV ?? viteEnv.VITE_BUNWORKS_DEV,
        NODE_ENV: viteEnv.NODE_ENV,
        BUNWORKS_BASE_URL:
          viteEnv.BUNWORKS_BASE_URL ?? viteEnv.VITE_BUNWORKS_BASE_URL,
        BUNWORKS_API_BASE_URL:
          viteEnv.BUNWORKS_API_BASE_URL ?? viteEnv.VITE_BUNWORKS_API_BASE_URL,
        BUNWORKS_SIGNING_KEY: viteEnv.BUNWORKS_SIGNING_KEY,
        BUNWORKS_SIGNING_KEY_FALLBACK: viteEnv.BUNWORKS_SIGNING_KEY_FALLBACK,
      };
    }
  } catch {
    // noop
  }

  try {
    // Node-like environments (sometimes polyfilled Vite)
    if (process.env) {
      return {
        BUNWORKS_DEV:
          process.env.BUNWORKS_DEV ??
          process.env.NEXT_PUBLIC_BUNWORKS_DEV ??
          process.env.REACT_APP_BUNWORKS_DEV ??
          process.env.NUXT_PUBLIC_BUNWORKS_DEV ??
          process.env.VUE_APP_BUNWORKS_DEV ??
          process.env.VITE_BUNWORKS_DEV,

        NODE_ENV:
          process.env.NODE_ENV ??
          process.env.NEXT_PUBLIC_NODE_ENV ??
          process.env.REACT_APP_NODE_ENV ??
          process.env.NUXT_PUBLIC_NODE_ENV ??
          process.env.VUE_APP_NODE_ENV ??
          process.env.VITE_NODE_ENV ??
          process.env.VITE_MODE,

        BUNWORKS_BASE_URL:
          process.env.BUNWORKS_BASE_URL ??
          process.env.NEXT_PUBLIC_BUNWORKS_BASE_URL ??
          process.env.REACT_APP_BUNWORKS_BASE_URL ??
          process.env.NUXT_PUBLIC_BUNWORKS_BASE_URL ??
          process.env.VUE_APP_BUNWORKS_BASE_URL ??
          process.env.VITE_BUNWORKS_BASE_URL,

        BUNWORKS_API_BASE_URL:
          process.env.BUNWORKS_API_BASE_URL ??
          process.env.NEXT_PUBLIC_BUNWORKS_API_BASE_URL ??
          process.env.REACT_APP_BUNWORKS_API_BASE_URL ??
          process.env.NUXT_PUBLIC_BUNWORKS_API_BASE_URL ??
          process.env.VUE_APP_BUNWORKS_API_BASE_URL ??
          process.env.VITE_BUNWORKS_API_BASE_URL,

        BUNWORKS_SIGNING_KEY: process.env.BUNWORKS_SIGNING_KEY,

        BUNWORKS_SIGNING_KEY_FALLBACK: process.env.BUNWORKS_SIGNING_KEY_FALLBACK,
      };
    }
  } catch {
    // noop
  }

  // Deno
  try {
    const denoEnv = Deno.env.toObject();

    if (denoEnv) {
      return {
        BUNWORKS_DEV: denoEnv.BUNWORKS_DEV,
        NODE_ENV: denoEnv.NODE_ENV,
        BUNWORKS_BASE_URL: denoEnv.BUNWORKS_BASE_URL,
        BUNWORKS_API_BASE_URL: denoEnv.BUNWORKS_API_BASE_URL,
        BUNWORKS_SIGNING_KEY: denoEnv.BUNWORKS_SIGNING_KEY,
        BUNWORKS_SIGNING_KEY_FALLBACK: denoEnv.BUNWORKS_SIGNING_KEY_FALLBACK,
      };
    }
  } catch {
    // noop
  }

  // Netlify
  try {
    const netlifyEnv = Netlify.env.toObject();

    if (netlifyEnv) {
      return {
        BUNWORKS_DEV: netlifyEnv.BUNWORKS_DEV,
        NODE_ENV: netlifyEnv.NODE_ENV,
        BUNWORKS_BASE_URL: netlifyEnv.BUNWORKS_BASE_URL,
        BUNWORKS_API_BASE_URL: netlifyEnv.BUNWORKS_API_BASE_URL,
        BUNWORKS_SIGNING_KEY: netlifyEnv.BUNWORKS_SIGNING_KEY,
        BUNWORKS_SIGNING_KEY_FALLBACK: netlifyEnv.BUNWORKS_SIGNING_KEY_FALLBACK,
      };
    }
  } catch {
    // noop
  }
})();

/**
 * The Deno environment, which is not always available.
 */
declare const Deno: {
  env: { toObject: () => Env };
};

/**
 * The Netlify environment, which is not always available.
 */
declare const Netlify: {
  env: { toObject: () => Env };
};

/**
 * Given a `key`, get the environment variable under that key.
 */
export const getEnvVar = (key: keyof ExpectedEnv): string | undefined => {
  return env?.[key];
};
