import dotenv from "dotenv";

dotenv.config();

const parsePort = (maybePort: string | undefined): number => {
  const port = Number(maybePort ?? "4000");
  return Number.isNaN(port) ? 4000 : port;
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePort(process.env.PORT),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/wiki_clone",
  jwtSecret: process.env.JWT_SECRET ?? "local-dev-secret",
  appOrigin: process.env.APP_ORIGIN ?? "http://localhost:5173",
};
