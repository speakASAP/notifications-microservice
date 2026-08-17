import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtRolesGuard } from './jwt-roles.guard';

@Module({
  imports: [
    // Verify-only: this service never mints tokens (auth-microservice is the sole
    // issuer). Registering signOptions would hand every verifier a usable signing
    // key, so a compromise here could forge tokens the whole cluster accepts.
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  providers: [JwtRolesGuard],
  exports: [JwtModule, JwtRolesGuard],
})
export class AuthModule {}
