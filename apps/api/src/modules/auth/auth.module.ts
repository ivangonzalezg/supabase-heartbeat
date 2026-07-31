import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { DatabaseModule } from '../../database/database.module';
import { DatabaseService } from '../../database/database.service';
import { createAuth } from './auth.config';
import { FirstAdminBootstrapService } from './first-admin-bootstrap.service';

@Module({
  imports: [
    DatabaseModule,
    BetterAuthModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [DatabaseService],
      useFactory: (databaseService: DatabaseService) => ({
        auth: createAuth(databaseService.db),
      }),
    }),
  ],
  providers: [FirstAdminBootstrapService],
})
export class AuthModule {}
