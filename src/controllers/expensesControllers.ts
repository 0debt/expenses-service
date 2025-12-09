import { Hono } from "hono";
import { Expense } from "../models/expenses.ts"; 
import { calculateGroupBalance, generatePayments } from "../services/balance.service.ts";
import { convertCurrency } from "../services/currency.service.ts";
import { validateUserInGroup } from "../services/groups.adapter.ts";
import { getGroupStats } from "../services/stats.service.ts";
import { redis } from "../config/redis.ts";


let apiversion = "/api/v1";

//Inicializamos el servidor
const expensesRoute = new Hono();

//health --> Coolify
expensesRoute.get("/health", (c) => {
    return c.json({ status: "ok", message: "Expenses Service is running" });
})



// POST /api/v1/expenses (Creation Endpoint)
expensesRoute.post(`${apiversion}/expenses`, async (c) => {
    try {
        const body = await c.req.json();
        const userPlan = c.req.header('X-User-Plan') || 'FREE';
        if (userPlan === 'FREE') {
            // Lógica para usuarios FREE: límite de 10 gastos por grupo
            const count = await Expense.countDocuments({ groupId: body.groupId });
            const LIMIT_FREE = 50;
            if (count >= LIMIT_FREE) {
                return c.json({ 
                    status: "error", 
                    message: `Free plan limit reached: Max ${LIMIT_FREE} expenses per group.`, 
                    code: "LIMIT_REACHED",
                }, 403); // 403 Forbidden
            }

        }

        // Requisito V2: Verificar membresía antes de crear gasto 
        const isMember = await validateUserInGroup(body.groupId, body.payerId);
        
        if (!isMember) {
            return c.json({ 
                status: "error", 
                message: "User does not belong to this group (Validation Rejected)" 
            }, 403); // 403 Forbidden
        }

        // 1. Extraemos los datos clave para la conversión
        const amountInput = body.totalAmount;
        const currencyInput = body.currency || 'EUR'; // Por defecto Euros si no especifican

        // 2. Llamamos a nuestro servicio de integración con Frankfurter API 
        // Esto convertirá el dinero a la moneda base del grupo (asumimos EUR por ahora)
        const conversion = await convertCurrency(amountInput, currencyInput, 'EUR');

        // 3. Si hubo conversión, también debemos ajustar las "shares" (participaciones)
        // Ejemplo: Si 100 USD son 92 EUR, y Paco pagaba 50 USD, ahora debe constar que pagó 46 EUR.
        let processedShares = body.shares;
        
        if (conversion.rate !== 1) {
            processedShares = body.shares.map((share: any) => ({
                ...share,
                // Multiplicamos por la tasa y redondeamos a 2 decimales
                amount: Math.round((share.amount * conversion.rate) * 100) / 100
            }));
        }

        // 4. Preparamos el objeto final para guardar en Mongo
        const newExpense = new Expense({
            ...body,
            // Guardamos los valores convertidos como los principales
            totalAmount: conversion.amount,
            shares: processedShares,
            
            // Guardamos los metadatos originales (requisito de auditoría/negocio)
            originalAmount: amountInput,
            currency: currencyInput,
            exchangeRate: conversion.rate,
            
            date: body.date ? new Date(body.date) : new Date()
        });
        
        // 5. Guardamos en Atlas
        const savedExpense = await newExpense.save();

        //INVALIDACIÓN DE CACHÉ
        // Si hay un gasto nuevo, el balance antiguo ya no sirve. Lo borramos.
        await redis.del(`balance:${body.groupId}`);

        //PUBLICACIÓN DE EVENTO (Redis Pub/Sub)
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

        // Publicamos en el canal 'events'
        await redis.publish('events', JSON.stringify(eventPayload));
        console.log("Evento 'expense.created' publicado en Redis");


        return c.json({ 
            status: "ok", 
            message: "Expense created successfully", 
            data: savedExpense 
        }, 201);

    } catch (error: any) {
        console.error("Error creating expense:", error);
        return c.json({ 
            status: "error", 
            message: error.message || "Failed to create expense" 
        }, 400);
    }
});

// GET /api/v1/expenses/groups/:groupId
expensesRoute.get(`${apiversion}/expenses/groups/:groupId`, async (c) => {
    const groupId = c.req.param('groupId');

    try {
        // Buscamos solo los gastos que coincidan con ese groupId
        const expenses = await Expense.find({ groupId: groupId }).sort({ date: -1 });
        
        return c.json({
            status: "ok",
            data: expenses
        });
    } catch (error: any) {
        return c.json({ status: "error", message: error.message }, 500);
    }
});

// GET /api/v1/balances/:groupId
expensesRoute.get(`${apiversion}/balances/:groupId`, async (c) => {
    const groupId = c.req.param('groupId');
    const cacheKey = `balances:${groupId}`;


    try {
        //Intentamos obtener datos de la caché
        const cachedData = await redis.get(cacheKey);
        if(cachedData) {
            console.log(`Cache hit for group ${groupId}`);
            return c.json({ status: "ok", 
                data: JSON.parse(cachedData),
                source: "cache" });
            };
        console.log(`Cache miss for group ${groupId}`);
        // Llamamos a nuestro servicio (lógica pura)
        const balances = await calculateGroupBalance(groupId);

        const payments = generatePayments(balances);

        const responseData = { balances, payments };

        // Guardamos el resultado en caché por 60 segundos 
        await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 60); 

        return c.json({
            status: "ok",
            data: responseData,
            source: "database"
        });
    } catch (error: any) {
        console.error("Error calculating balance:", error);
        return c.json({ status: "error", message: "Failed to calculate balance" }, 500);
    }
});


// GET /api/v1/internal/stats/:groupId
// Endpoint para comunicación entre microservicios (Analytics)
expensesRoute.get(`${apiversion}/internal/stats/:groupId`, async (c) => {
    const groupId = c.req.param('groupId');
    
    console.log(`Generando estadísticas internas para grupo: ${groupId}`);

    try {
        const stats = await getGroupStats(groupId);
        
        return c.json({
            status: "ok",
            data: stats
        });
    } catch (error: any) {
        console.error("Error generating stats:", error);
        return c.json({ status: "error", message: "Failed to generate stats" }, 500);
    }
});

// GET /api/v1/internal/users/:userId/debt-status
// Endpoint para la SAGA de borrado de usuarios
expensesRoute.get(`${apiversion}/internal/users/:userId/debtStatus`, async (c) => {
    const userId = c.req.param('userId');

    try {
        // Buscamos si el usuario aparece en algún share de gastos recientes
        const hasExpenses = await Expense.exists({
            $or: [
                { payerId: userId },
                { 'shares.userId': userId }
            ]
        });

        // Si existe algún gasto donde participa, consideramos que tiene "historial/deuda" 
        // y no es posible el borrado.
        const hasDebt = !!hasExpenses;

        return c.json({
            status: "ok",
            data: {
                userId,
                canDelete: !hasDebt, // Solo se puede borrar si NO tiene historial
                hasPendingDebts: hasDebt
            }
        });

    } catch (error) {
        return c.json({ status: "error", message: "Check failed" }, 500);
    }
});


export default expensesRoute;