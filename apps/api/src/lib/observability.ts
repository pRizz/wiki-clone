import * as Sentry from "@sentry/node";

const hasInitialized = { value: false };

export const initObservability = (): void => {
  if (hasInitialized.value) {
    return;
  }

  const maybeDsn = process.env.SENTRY_DSN;
  if (!maybeDsn) {
    hasInitialized.value = true;
    return;
  }

  Sentry.init({
    dsn: maybeDsn,
    tracesSampleRate: 1.0,
  });

  hasInitialized.value = true;
};

export const captureException = (error: unknown): void => {
  Sentry.captureException(error);
};

export const runSpan = async <T>(
  op: string,
  name: string,
  callback: () => Promise<T>,
): Promise<T> =>
  Sentry.startSpan(
    {
      op,
      name,
    },
    callback,
  );
