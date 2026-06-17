import { z } from 'zod';

export const TransactionSchema = z.object({
  id: z.string(),
  amount: z.number(),
  timestamp: z.date(),
  status: z.enum(['pending', 'settled', 'failed']),
});

export type Transaction = z.infer<typeof TransactionSchema>;
