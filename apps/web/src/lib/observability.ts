import * as Sentry from "@sentry/react";

let isInitialized = false;

export const initObservability = (): void => {
  if (isInitialized) {
    return;
  }

  const maybeDsn = import.meta.env.VITE_SENTRY_DSN?.toString();
  if (!maybeDsn) {
    isInitialized = true;
    return;
  }

  Sentry.init({
    dsn: maybeDsn,
    tracesSampleRate: 1.0,
    integrations: [
      Sentry.consoleLoggingIntegration({
        levels: ["log", "warn", "error"],
      }),
    ],
    _experiments: {
      enableLogs: true,
    },
  });

  isInitialized = true;
};

export const { logger } = Sentry;

export const captureException = (error: unknown): void => {
  Sentry.captureException(error);
};

export const startUiSpan = async <T>(
  actionName: string,
  callback: () => Promise<T>,
): Promise<T> =>
  Sentry.startSpan(
    {
      op: "ui.action",
      name: actionName,
    },
    callback,
  );

export const startHttpSpan = async <T>(
  requestName: string,
  callback: () => Promise<T>,
): Promise<T> =>
  Sentry.startSpan(
    {
      op: "http.client",
      name: requestName,
    },
    callback,
  );
