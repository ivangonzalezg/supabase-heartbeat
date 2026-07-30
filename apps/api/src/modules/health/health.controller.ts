import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({
    description: 'The API is up and running.',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-07-30T08:24:40.000Z',
        uptime: 12.345,
      },
    },
  })
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
