import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AdminTokenGuard } from './common/admin-token.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DeviceLogsModule } from './device-logs/device-logs.module';
import { DevicesModule } from './devices/devices.module';
import { SoilSettingsModule } from './soil-settings/soil-settings.module';
import { SoilReadingsModule } from './soil-readings/soil-readings.module';
import { BatteryModule } from './battery/battery.module';
import { BatteryLogsModule } from './battery-logs/battery-logs.module';
import { BatteryNormalizationModule } from './battery-normalization/battery-normalization.module';
import { PumpSettingsModule } from './pump-settings/pump-settings.module';
import { WateringLogsModule } from './watering-logs/watering-logs.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      // The dashboard has no build step or hashed filenames, so a cached
      // shared.js can pair with a freshly edited device.html and break on a
      // function that "doesn't exist". Revalidating every request keeps the
      // HTML and its scripts in step; these files are small and local.
      serveStaticOptions: {
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'no-cache');
        },
      },
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432'),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASS ?? '',
      database: process.env.DB_NAME ?? 'esp32',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    DeviceLogsModule,
    DevicesModule,
    SoilSettingsModule,
    SoilReadingsModule,
    BatteryModule,
    BatteryLogsModule,
    BatteryNormalizationModule,
    PumpSettingsModule,
    WateringLogsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Applies to every route: reads pass through, writes need the admin
    // token, firmware endpoints are exempt. See AdminTokenGuard.
    { provide: APP_GUARD, useClass: AdminTokenGuard },
  ],
})
export class AppModule {}
