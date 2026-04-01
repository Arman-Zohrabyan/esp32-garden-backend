import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('device')
  device(@Res() res: Response) {
    res.sendFile(join(__dirname, '..', 'public', 'device.html'));
  }

  @Get('logs')
  logs(@Res() res: Response) {
    res.sendFile(join(__dirname, '..', 'public', 'logs.html'));
  }
}
