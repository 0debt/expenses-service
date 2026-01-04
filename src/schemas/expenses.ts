import { z } from '@hono/zod-openapi';

//Componentes básicos
export const ShareSchema = z.object({
  userId: z.string().openapi({ example: 'user_paco_123' }),
  amount: z.number().openapi({ example: 50.00 })
});

//Esquema de Creación de Gasto (Input)
export const CreateExpenseSchema = z.object({
  description: z.string().min(3).openapi({ example: 'Cena en Roma' }),
  totalAmount: z.number().positive().openapi({ example: 100.50 }),
  currency: z.string().default('EUR').openapi({ example: 'EUR', description: 'Moneda original (USD, GBP...)' }),
  payerId: z.string().openapi({ example: 'user_paco_123' }),
  groupId: z.string().openapi({ example: 'viaje_italia_2024' }),
  category: z.enum(['FOOD', 'TRANSPORT', 'ACCOMMODATION', 'ENTERTAINMENT', 'OTHER'])
  .default('OTHER')
  .openapi({ example: 'FOOD' }),

  shares: z.array(ShareSchema),
  date: z.string().datetime().optional().openapi({ example: '2024-11-27T20:00:00Z' })
});

//Esquema de Headers (Para el Plan del Usuario)
export const HeadersSchema = z.object({
  'X-User-Plan': z.enum(['FREE', 'PRO', 'ENTERPRISE']).optional().default('FREE').openapi({ example: 'FREE' })
});

//Esquema de Respuesta de Gasto (Output)
export const ExpenseResponseSchema = CreateExpenseSchema.extend({
  _id: z.string().openapi({ example: '65f1a2b3c4d5e6f7g8h9i0j' }),
  createdAt: z.string(),
  updatedAt: z.string(),
  originalAmount: z.number().optional(),
  exchangeRate: z.number().optional()
});

//Esquema para Balances
export const BalanceResponseSchema = z.object({
  balances: z.record(z.string(), z.number()).openapi({ example: { "Paco": 50, "Paloma": -50 } }),
  payments: z.array(z.object({
    from: z.string(),
    to: z.string(),
    amount: z.number()
  })).openapi({ example: [{ from: "Paloma", to: "Paco", amount: 50 }] })
});

//Esquema de Error
export const ErrorSchema = z.object({
  status: z.string().openapi({ example: 'error' }),
  message: z.string().openapi({ example: 'Validation Failed' }),
  code: z.string().openapi({ example: 'LIMIT_REACHED' }).optional()
});

//Esquema para el Health Check
export const HealthResponseSchema = z.object({
  status: z.string().openapi({ example: 'ok' }),
  message: z.string().openapi({ example: 'Expenses Service is running' })
});


//Esquema del desglose de categorías
export const StatsResponseSchema = z.object({
  totalSpent: z.number().openapi({ example: 150.50 }),
  count: z.number().openapi({ example: 5 }),
  lastUpdated: z.string().datetime().openapi({ example: '2024-12-01T10:00:00Z' }),
  byCategory: z.record(z.string(), z.number()).openapi({ 
    example: { 
      'FOOD': 100.50, 
      'TRANSPORT': 50.00 
    } 
  })
});


// Esquema para la actualización de gastos 
export const UpdateExpenseSchema = CreateExpenseSchema.partial();

// Esquema para la respuesta de borrado
export const DeleteResponseSchema = z.object({
  status: z.string().openapi({ example: 'ok' }),
  message: z.string().openapi({ example: 'Expense deleted successfully' }),
  deletedId: z.string().openapi({ example: '65f1...' })
});

export const SettlementSchema = z.object({
  groupId: z.string().openapi({ example: 'viaje_usa_2025' }),
  fromUserId: z.string().openapi({ example: 'user-123', description: 'Usuario que paga' }),
  toUserId: z.string().openapi({ example: 'user-456', description: 'Usuario que recibe' }),
  amount: z.number().positive().openapi({ example: 75.50 })
});

export const SettlementResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
  data: z.object({
    settlementId: z.string(),
    groupId: z.string(),
    fromUserId: z.string(),
    toUserId: z.string(),
    amount: z.number()
  }).optional()
});