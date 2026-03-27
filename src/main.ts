import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import { AppModule } from './app.module';

async function ensureDatabase() {
  const dbName = process.env.DB_NAME ?? 'esp32';
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432'),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? '',
    database: 'postgres',
  });
  await client.connect();
  const result = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [dbName],
  );
  if (result.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Database "${dbName}" created`);
  }
  await client.end();
}

async function bootstrap() {
  await ensureDatabase();
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3055);
}
bootstrap();
