import { Hono } from "hono";
import { Expense } from "../models/expenses.ts"; 
import { calculateGroupBalance, generatePayments } from "../services/balance.service.ts";
import { convertCurrency } from "../services/currency.service.ts";
import { validateUserInGroup } from "../services/groups.adapter.ts";

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

    try {
        // Llamamos a nuestro servicio (lógica pura)
        const balances = await calculateGroupBalance(groupId);

        const payments = generatePayments(balances);

        return c.json({
            status: "ok",
            data: {
                balances,
                payments
            }
        });
    } catch (error: any) {
        console.error("Error calculating balance:", error);
        return c.json({ status: "error", message: "Failed to calculate balance" }, 500);
    }
});


export default expensesRoute;