import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtRolesGuard } from './jwt-roles.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [JwtRolesGuard],
  exports: [JwtModule, JwtRolesGuard],
})
export class AuthModule {}
