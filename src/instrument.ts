// Debe cargarse ANTES de leer cualquier SENTRY_* de process.env: @nestjs/config recién
// carga el .env cuando se importa AppModule, que ocurre después que este archivo (tiene
// que ser el primer import de main.ts para instrumentar el arranque completo). Sin este
// require, SENTRY_DSN llega como undefined aquí y Sentry.init() nunca se ejecuta.
import 'dotenv/config';
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'development',
    release: process.env.npm_package_version,
    // Sin tracing de rendimiento: solo error tracking.
    integrations: [],
  });
}
