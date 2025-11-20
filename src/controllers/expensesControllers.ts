import { Hono } from "hono";
import { Expense } from "../models/expenses.ts"; 

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
        // 1. Obtenemos los datos reales del cuerpo de la petición
        const body = await c.req.json();

        // 2. Instanciamos el modelo de Mongoose
        // Mongoose validará automáticamente que 'body' tenga los campos requeridos
        const newExpense = new Expense({
            ...body,
            date: body.date ? new Date(body.date) : new Date() // Asegurar formato fecha
        });
        
        // 3. Guardamos en Atlas
        const savedExpense = await newExpense.save();

        return c.json({ 
            status: "ok", 
            message: "Expense created successfully", 
            data: savedExpense 
        }, 201);

    } catch (error: any) {
        console.error("Error creating expense:", error);
        
        // Devolvemos un error 400 si la validación falla (ej: falta amount)
        return c.json({ 
            status: "error", 
            message: error.message || "Failed to create expense" 
        }, 400);
    }
});

export default expensesRoute;