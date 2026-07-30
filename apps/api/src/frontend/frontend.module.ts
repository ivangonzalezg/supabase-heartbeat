import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { getFrontendBuildPath } from './frontend-build-path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: getFrontendBuildPath(),
      exclude: ['/api/{*any}'],
    }),
  ],
})
export class FrontendModule {}
