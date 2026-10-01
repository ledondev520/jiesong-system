import { createCrudService } from './crudService';

export interface ForexVerification {
  id: string;
  verificationNo: string;
  salesContractId: string;
  customsDeclarationId?: string | null;
  bankName?: string | null;
  currency: string;
  receivedAmount: number;
  settledAmount?: number | null;
  exchangeRate?: number | null;
  verifiedAt?: string | null;
  status: string;
  note?: string | null;
}

export const forexVerificationService = createCrudService<ForexVerification>( '/forex-verifications');
