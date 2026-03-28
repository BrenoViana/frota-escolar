import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const allowedOrigins = (() => {
    const raw = process.env.ALLOWED_ORIGINS;
    if (!raw) return ['*'];
    const origins = raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    return origins.length > 0 ? origins : ['*'];
  })();
  app.enableCors({ origin: allowedOrigins });

  const parsedPort = Number.parseInt(process.env.API_PORT ?? '', 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API up on :${port}`);
}
bootstrap();
