import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Expense } from "../models/expenses.ts";
import { calculateGroupBalance, generatePayments } from "../services/balance.service";
import { convertCurrency } from "../services/currency.service";
import { validateUserInGroup } from "../services/groups.adapter";
import { getGroupStats } from "../services/stats.service";
import { redis } from "../config/redis";
import { 
  CreateExpenseSchema, 
  ExpenseResponseSchema, 
  HeadersSchema, 
  ErrorSchema, 
  BalanceResponseSchema,
  HealthResponseSchema,
  StatsResponseSchema,
  UpdateExpenseSchema,
  DeleteResponseSchema
} from '../schemas/expenses';
import { GroupStats } from '../models/GroupStats.ts'; 
import { ca } from 'zod/locales';

const app = new OpenAPIHono();
const apiversion = "/api/v1";

//health --> Coolify
const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Health Check',
  description: 'Verifica que el servicio está activo y respondiendo.',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthResponseSchema
        }
      },
      description: 'Servicio operativo'
    }
  }
});


app.openapi(healthRoute, (c) => {
  return c.json({ 
    status: "ok", 
    message: "Expenses Service is running" 
  }, 200);
});

//POST /expenses 
const createExpenseRoute = createRoute({
  method: 'post',
  path: `${apiversion}/expenses`,
  tags: ['Gastos'],
  summary: 'Crear nuevo gasto',
  description: 'Crea un gasto, valida plan, convierte divisa y notifica evento.',
  request: {
    headers: HeadersSchema, 
    body: {
      content: { 'application/json': { schema: CreateExpenseSchema } }
    }
  },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ status: z.string(), data: ExpenseResponseSchema }) } }, description: 'Gasto creado' },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Error de validación' },
    403: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Prohibido (Plan o Grupo)' }
  }
});

app.openapi(createExpenseRoute, async (c) => {
  // Zod valida automáticamente el body y headers
  const body = c.req.valid('json');
  const headers = c.req.valid('header'); 
  
  const userPlan = headers['X-User-Plan'] || 'FREE';

  try {
    //LÓGICA DE PLANES
    if (userPlan === 'FREE') {
        const count = await Expense.countDocuments({ groupId: body.groupId });
        const LIMIT_FREE = 50;
        if (count >= LIMIT_FREE) {
            return c.json({ 
                status: "error", 
                message: `Free plan limit reached: Max ${LIMIT_FREE} expenses per group.`
            }, 403);
        }
    }

    //VALIDACIÓN DE GRUPO
    const isMember = await validateUserInGroup(body.groupId, body.payerId);
    if (!isMember) {
        return c.json({ status: "error", message: "User not in group" }, 403);
    }

    //CONVERSIÓN DE DIVISA
    const conversion = await convertCurrency(body.totalAmount, body.currency, 'EUR');

    let processedShares = body.shares;
    if (conversion.rate !== 1) {
        processedShares = body.shares.map((share: any) => ({
            ...share,
            amount: Math.round((share.amount * conversion.rate) * 100) / 100
        }));
    }

    //GUARDADO EN MONGO
    const newExpense = new Expense({
        ...body,
        totalAmount: conversion.amount,
        shares: processedShares,
        originalAmount: body.totalAmount,
        currency: body.currency,
        exchangeRate: conversion.rate,
        date: body.date ? new Date(body.date) : new Date()
    });
    
    const savedExpense = await newExpense.save();
    //SUMAMOS LOS GASTOS AL TOTAL ACUMULADO DEL GRUPO -MATERIALIZED VIEW
    await GroupStats.findOneAndUpdate(
      { groupId: body.groupId },
      { $inc: { 
        totalSpent: conversion.amount, 
        expenseCount: 1,
        [`categoryBreakdown.${body.category}`]: conversion.amount
      },
      $set: {lastUpdated: new Date()} },
      { upsert: true }
    );
  

    //REDIS
    await redis.del(`balances:${body.groupId}`); // Invalidar caché

    const eventPayload = {
        type: 'expense.created',
        data: {
            expenseId: savedExpense._id,
            groupId: savedExpense.groupId,
            amount: savedExpense.totalAmount,
            payerId: savedExpense.payerId,
            description: savedExpense.description
        },
        timestamp: new Date()
    };
    await redis.publish('events', JSON.stringify(eventPayload));

    //NORMALIZAR EL GASTO PARA RESPONDER SEGÚN ESQUEMA OpenAPI (IDs como strings, fechas ISO)
    const expenseData = {
      description: savedExpense.description,
      totalAmount: savedExpense.totalAmount,
      currency: savedExpense.currency,
      payerId: String(savedExpense.payerId),
      groupId: String(savedExpense.groupId),
      category: savedExpense.category as any,
      shares: (savedExpense.shares || []).map((s: any) => ({ userId: String(s.userId), amount: s.amount })),
      _id: String(savedExpense._id),
      createdAt: savedExpense.createdAt ? new Date(savedExpense.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: savedExpense.updatedAt ? new Date(savedExpense.updatedAt).toISOString() : new Date().toISOString(),
      date: savedExpense.date ? new Date(savedExpense.date).toISOString() : undefined,
      originalAmount: savedExpense.originalAmount,
      exchangeRate: savedExpense.exchangeRate
    };

    return c.json({ status: "ok", message: "Created", data: expenseData }, 201);

  } catch (error: any) {
    return c.json({ status: "error", message: error.message }, 400);
  }
});


// --- DELETE /expenses/:id ---
const deleteExpenseRoute = createRoute({
  method: 'delete',
  path: `${apiversion}/expenses/{id}`,
  tags: ['Gastos'],
  summary: 'Eliminar un gasto',
  description: 'Borra el gasto, actualiza las estadísticas (resta el importe) e invalida la caché de balances.',
  request: {
    params: z.object({ id: z.string() })
  },
  responses: {
    200: { content: { 'application/json': { schema: DeleteResponseSchema } }, description: 'Borrado exitoso' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Gasto no encontrado' },
    500: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Error interno' }
  }
});

app.openapi(deleteExpenseRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    // 1. Buscamos el gasto primero (necesitamos sus datos para revertir estadísticas)
    const expense = await Expense.findById(id);

    if (!expense) {
      return c.json({ status: "error", message: "Expense not found" }, 404);
    }

    // 2. ACTUALIZAR VISTA MATERIALIZADA (Revertir la suma)
    // Restamos el importe del total y de la categoría correspondiente
    await GroupStats.findOneAndUpdate(
      { groupId: expense.groupId },
      { 
        $inc: { 
          totalSpent: -expense.totalAmount, // Restamos (número negativo)
          expenseCount: -1, 
          [`categoryBreakdown.${expense.category}`]: -expense.totalAmount 
        },
        $set: { lastUpdated: new Date() }
      }
    );

    // 3. Borramos físicamente
    await expense.deleteOne();

    // 4. INVALIDAR CACHÉ (El balance ha cambiado)
    await redis.del(`balances:${expense.groupId}`);

    // 5. PUBLICAR EVENTO (Opcional, pero recomendado)
    await redis.publish('events', JSON.stringify({
      type: 'expense.deleted',
      data: { expenseId: id, groupId: expense.groupId }
    }));

    return c.json({ 
      status: "ok", 
      message: "Expense deleted successfully", 
      deletedId: id 
    }, 200);

  } catch (error: any) {
    return c.json({ status: "error", message: error.message }, 500);
  }
});



// --- PUT /expenses/:id ---
const updateExpenseRoute = createRoute({
  method: 'put',
  path: `${apiversion}/expenses/{id}`,
  tags: ['Gastos'],
  summary: 'Actualizar un gasto',
  description: 'Actualiza datos, recalcula conversión de divisa si es necesario y ajusta estadísticas.',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: { 'application/json': { schema: UpdateExpenseSchema } }
    }
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ status: z.string(), data: ExpenseResponseSchema }) } }, description: 'Actualizado' },
    404: { description: 'No encontrado' },
    500: { description: 'Error' }
  }
});

app.openapi(updateExpenseRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const oldExpense = await Expense.findById(id);
    if (!oldExpense) return c.json({ status: "error", message: "Not found" }, 404);

    let newTotalAmount = oldExpense.totalAmount;
    let newExchangeRate = oldExpense.exchangeRate;
    let newShares = body.shares || oldExpense.shares;

    // A. Si cambia el importe o la moneda, hay que RECALCULAR CONVERSIÓN
    if ( (body.totalAmount && body.totalAmount !== oldExpense.originalAmount) || 
         (body.currency && body.currency !== oldExpense.currency) ) {
      
      const amountToConvert = body.totalAmount || oldExpense.originalAmount;
      const currencyToConvert = body.currency || oldExpense.currency;

      // Llamada a Frankfurter
      const conversion = await convertCurrency(amountToConvert, currencyToConvert, 'EUR');
      
      newTotalAmount = conversion.amount;
      newExchangeRate = conversion.rate;

      // Recalcular las participaciones (shares) con la nueva tasa
      if (body.shares) {
        newShares = body.shares.map((share: any) => ({
            ...share,
            amount: Math.round((share.amount * conversion.rate) * 100) / 100
        }));
      }
    }

    // B. ACTUALIZAR VISTA MATERIALIZADA (Ajuste Diferencial)
    // Es más seguro hacerlo en dos pasos: restar lo viejo y sumar lo nuevo
    if (newTotalAmount !== oldExpense.totalAmount || body.category !== oldExpense.category) {
        // 1. Revertir viejo
        await GroupStats.findOneAndUpdate(
            { groupId: oldExpense.groupId },
            { $inc: { 
                totalSpent: -oldExpense.totalAmount, 
                [`categoryBreakdown.${oldExpense.category}`]: -oldExpense.totalAmount 
            }}
        );
        // 2. Aplicar nuevo
        const finalCategory = body.category || oldExpense.category;
        await GroupStats.findOneAndUpdate(
            { groupId: oldExpense.groupId },
            { $inc: { 
                totalSpent: newTotalAmount, 
                [`categoryBreakdown.${finalCategory}`]: newTotalAmount 
            }}
        );
    }

    // C. ACTUALIZAR DOCUMENTO
    // Fusionamos los datos viejos con los nuevos
    Object.assign(oldExpense, {
        ...body,
        totalAmount: newTotalAmount,
        exchangeRate: newExchangeRate,
        shares: newShares
    });

    const saved = await oldExpense.save();

    // D. INVALIDAR CACHÉ
    await redis.del(`balances:${oldExpense.groupId}`);

    return c.json({ status: "ok", data: saved.toObject() }, 200);

  } catch (error: any) {
    return c.json({ status: "error", message: error.message }, 500);
  }
});




//GET /balances/:groupId
const getBalancesRoute = createRoute({
  method: 'get',
  path: `${apiversion}/balances/{groupId}`,
  tags: ['Balances'],
  request: {
    params: z.object({ groupId: z.string().openapi({ example: 'viaje_usa_2025' }) })
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ status: z.string(), data: BalanceResponseSchema, source: z.string() }) } }, description: 'Balances calculados' },
    500: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Error interno' }
  }
});

app.openapi(getBalancesRoute, async (c) => {
  const { groupId } = c.req.valid('param');
  const cacheKey = `balances:${groupId}`;

  try {
      const cachedData = await redis.get(cacheKey);
      if(cachedData) {
          return c.json({ status: "ok", data: JSON.parse(cachedData), source: "cache" }, 200);
      };

      const balances = await calculateGroupBalance(groupId);
      const payments = generatePayments(balances);
      const responseData = { balances, payments };

      await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 60); 

      return c.json({ status: "ok", data: responseData, source: "database" }, 200);
  } catch (error: any) {
      return c.json({ status: "error", message: "Failed to calculate balance" }, 500);
  }
});

//GET /expenses/groups/:groupId
const getGroupExpensesRoute = createRoute({
    method: 'get',
    path: `${apiversion}/expenses/groups/{groupId}`,
    tags: ['Gastos'],
    request: { params: z.object({ groupId: z.string() }) },
    responses: {
        200: { description: 'Lista de gastos del grupo' }, 
        500: { description: 'Error' }
    }
});

app.openapi(getGroupExpensesRoute, async (c) => {
    const { groupId } = c.req.valid('param');
    try {
        const expenses = await Expense.find({ groupId: groupId }).sort({ date: -1 });
        return c.json({ status: "ok", data: expenses }, 200);
    } catch (error: any) {
        return c.json({ status: "error", message: error.message }, 500);
    }
});

// --- GET /expenses/:id (Obtener un gasto específico) ---
const getExpenseByIdRoute = createRoute({
  method: 'get',
  path: `${apiversion}/expenses/{id}`,
  tags: ['Gastos'],
  summary: 'Obtener un gasto por ID',
  description: 'Recupera los detalles completos de un gasto específico.',
  request: {
    params: z.object({ id: z.string() })
  },
  responses: {
    200: { 
      content: { 'application/json': { schema: z.object({ status: z.string(), data: ExpenseResponseSchema }) } }, 
      description: 'Gasto encontrado' 
    },
    404: { 
      content: { 'application/json': { schema: ErrorSchema } }, 
      description: 'Gasto no encontrado' 
    },
    500: { 
      content: { 'application/json': { schema: ErrorSchema } }, 
      description: 'Error interno' 
    }
  }
});

app.openapi(getExpenseByIdRoute, async (c) => {
  const { id } = c.req.valid('param');
  
  try {
    const expense = await Expense.findById(id);
    
    if (!expense) {
      return c.json({ status: "error", message: "Expense not found" }, 404);
    }

    // Normalizar respuesta - asegurar que los campos obligatorios nunca sean undefined
    const now = new Date().toISOString();
    const expenseData = {
      _id: String(expense._id),
      description: expense.description,
      totalAmount: expense.totalAmount,
      originalAmount: expense.originalAmount,
      currency: expense.currency,
      exchangeRate: expense.exchangeRate,
      date: expense.date ? new Date(expense.date).toISOString() : now,
      payerId: String(expense.payerId),
      groupId: String(expense.groupId),
      splitType: expense.splitType,
      category: expense.category as "FOOD" | "TRANSPORT" | "ACCOMMODATION" | "ENTERTAINMENT" | "OTHER",
      shares: (expense.shares || []).map((s: any) => ({ 
        userId: String(s.userId), 
        amount: s.amount 
      })),
      isSettlement: expense.isSettlement || false,
      createdAt: expense.createdAt ? new Date(expense.createdAt).toISOString() : now,
      updatedAt: expense.updatedAt ? new Date(expense.updatedAt).toISOString() : now
    };
    
    return c.json({ status: "ok", data: expenseData }, 200);
  } catch (error: any) {
    return c.json({ status: "error", message: error.message }, 500);
  }
});


// --- POST /settlements (Registrar pago de deuda) ---
const createSettlementRoute = createRoute({
  method: 'post',
  path: `${apiversion}/settlements`,
  tags: ['Settlements'],
  summary: 'Registrar un pago entre usuarios',
  description: 'Crea un registro de liquidación cuando un usuario paga su deuda a otro. Esto afecta el balance del grupo.',
  request: {
    body: {
      content: { 
        'application/json': { 
          schema: z.object({
            groupId: z.string().openapi({ example: 'viaje_usa_2025' }),
            fromUserId: z.string().openapi({ example: 'user-123', description: 'Usuario que paga la deuda' }),
            toUserId: z.string().openapi({ example: 'user-456', description: 'Usuario que recibe el pago' }),
            amount: z.number().positive().openapi({ example: 75.50, description: 'Cantidad pagada' })
          })
        } 
      }
    }
  },
  responses: {
    201: { 
      content: { 
        'application/json': { 
          schema: z.object({ 
            status: z.string(), 
            message: z.string(),
            data: z.object({
              settlementId: z.string(),
              groupId: z.string(),
              fromUserId: z.string(),
              toUserId: z.string(),
              amount: z.number()
            })
          }) 
        } 
      }, 
      description: 'Settlement registrado correctamente' 
    },
    400: { 
      content: { 'application/json': { schema: ErrorSchema } }, 
      description: 'Error de validación' 
    },
    500: { 
      content: { 'application/json': { schema: ErrorSchema } }, 
      description: 'Error interno' 
    }
  }
});

app.openapi(createSettlementRoute, async (c) => {
  const body = c.req.valid('json');
  
  try {
    // Crear un "gasto" especial de tipo settlement
    // La lógica: fromUser "pagó" a toUser, entonces:
    // - fromUser aparece como pagador (payerId)
    // - toUser aparece en shares (recibe el dinero)
    // Esto hace que el balance se ajuste correctamente
    const settlement = new Expense({
      description: `💸 Settlement payment`,
      totalAmount: body.amount,
      originalAmount: body.amount,
      currency: 'EUR',
      exchangeRate: 1,
      payerId: body.fromUserId,
      groupId: body.groupId,
      category: 'OTHER',
      splitType: 'EXACT',
      shares: [
        { userId: body.toUserId, amount: body.amount }
      ],
      isSettlement: true,
      date: new Date()
    });
    
    const saved = await settlement.save();
    
    // Invalidar caché de balances
    await redis.del(`balances:${body.groupId}`);
    
    // Publicar evento
    await redis.publish('events', JSON.stringify({
      type: 'settlement.created',
      data: {
        settlementId: saved._id,
        groupId: body.groupId,
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        amount: body.amount
      },
      timestamp: new Date()
    }));
    
    return c.json({ 
      status: "ok", 
      message: "Settlement recorded successfully",
      data: {
        settlementId: String(saved._id),
        groupId: body.groupId,
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        amount: body.amount
      }
    }, 201);
    
  } catch (error: any) {
    return c.json({ status: "error", message: error.message }, 500);
  }
});

//Rutas Internas (SAGA & Stats)

// Ejemplo internal stats documentado
const getInternalStatsRoute = createRoute({
    method: 'get',
    path: `${apiversion}/internal/stats/{groupId}`,
    tags: ['Internal'],
    summary: 'Estadísticas para Analytics Service (Materialized View)',
    description: 'Recupera las estadísticas precalculadas de gastos por grupo para uso interno entre microservicios.',
    request: { params: z.object({ groupId: z.string() }) },
    responses: { 
      200: { 
        content: {
           'application/json': { 
          schema: z.object({ 
            status: z.string(),
             data: StatsResponseSchema 
            })
           }
          },
        description: 'Estadísticas recuperadas'
       },
      500: { description: 'Error interno' }
    }
});

app.openapi(getInternalStatsRoute, async (c) => {
    const { groupId } = c.req.valid('param');
    try {
        const stats = await getGroupStats(groupId);
        return c.json({ status: "ok", data: stats }, 200);
    } catch (error: any) {
        return c.json({ status: "error", message: "Failed" }, 500);
    }
});

// SAGA Route 
app.get(`${apiversion}/internal/users/:userId/debtStatus`, async (c) => {
    const userId = c.req.param('userId');
    try {
        const hasExpenses = await Expense.exists({ $or: [{ payerId: userId }, { 'shares.userId': userId }] });
        return c.json({ status: "ok", data: { userId, canDelete: !hasExpenses, hasPendingDebts: !!hasExpenses } });
    } catch (error) {
        return c.json({ status: "error", message: "Check failed" }, 500);
    }
});

export default app;