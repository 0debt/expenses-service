import { Hono } from "hono";
import {getDatabase} from "../config/mongo.ts";

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
        // 1. Get database instance
        const db = await getDatabase(); 
        const collection = db.collection("expenses");

        // 2. Get data from request body (future: use c.req.json())
        const newExpense = {
            description: "Test Expense (via Refactored Controller)",
            amount: 100,
            date: new Date(),
        }
        
        // 3. Insert and return result
        const result = await collection.insertOne(newExpense);
        return c.json({ status: "ok", message: "Expense created", data: result }, 201);
    } catch (error) {
        console.error("Error creating expense:", error);
        return c.json({ status: "error", message: "Failed to create expense" }, 500);
    }
    // NOTICE: We no longer call client.close() here. 
    // The connection pool in src/db/mongo.ts remains open and reusable.
});

export default expensesRoute;