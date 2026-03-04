import type { ClinicRow, UserRow } from './domain';

declare global {
  namespace Express {
    interface Request {
      authContext?: {
        userId: string;
        email: string;
        clinic: ClinicRow;
        user: UserRow;
      };
      adminContext?: {
        userId: string;
        email: string;
      };
    }
  }
}

export {};
