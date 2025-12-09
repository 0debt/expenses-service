import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { app } from "../../src/index"; // Importamos la app
import mongoose from "mongoose";
import { Expense } from "../../src/models/expenses";

// Configuración: Usamos una BD distinta para no borrar tus datos de dev
const TEST_MONGO_URI = process.env.MONGO_URI?.replace('expenses-db', 'expenses-test-db');

describe("In-Process Tests (Integration)", () => {
    
    // Limpieza antes y después
    beforeAll(async () => {
        if (mongoose.connection.readyState === 0 && TEST_MONGO_URI) {
            await mongoose.connect(TEST_MONGO_URI);
        }
        await Expense.deleteMany({}); // Empezamos limpios
    },30000);

    afterAll(async () => {
        await Expense.deleteMany({}); // Limpiamos al acabar
        await mongoose.disconnect();
    },30000);

    test("GET /health debe devolver 200 OK", async () => {
        // Simulamos la petición (No usa red real)
        const res = await app.request("/health");
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toHaveProperty("status", "ok");
    });

    test("POST /api/v1/expenses debe crear un gasto y validarlo", async () => {
        const payload = {
            description: "Test In-Process",
            totalAmount: 50,
            currency: "EUR",
            payerId: "user_test_1",
            groupId: "group_test_in_process",
            shares: [{ userId: "user_test_1", amount: 50 }]
        };

        // Inyectamos headers simulados
        const res = await app.request("/api/v1/expenses", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-User-Plan": "PRO" 
            },
            body: JSON.stringify(payload)
        });

        const body: any = await res.json();

        expect(res.status).toBe(201);
        expect(body.data.description).toBe("Test In-Process");
        
        // Verificamos que se guardó en Mongo realmente
        const dbExpense = await Expense.findById(body.data._id);
        expect(dbExpense).not.toBeNull();
    });
});