type LogLevel = "info" | "error";

type LogPayload = {
  message: string;
  data?: Record<string, unknown>;
};

const writeLog = (level: LogLevel, payload: LogPayload): void => {
  const output = {
    level,
    timestamp: new Date().toISOString(),
    message: payload.message,
    data: payload.data ?? {},
  };

  if (level === "error") {
    console.error(JSON.stringify(output));
    return;
  }

  console.info(JSON.stringify(output));
};

export const logInfo = (message: string, data?: Record<string, unknown>): void => {
  writeLog("info", { message, data });
};

export const logError = (message: string, data?: Record<string, unknown>): void => {
  writeLog("error", { message, data });
};
