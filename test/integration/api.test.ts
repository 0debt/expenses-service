import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { app } from "../../src/index";
import mongoose from "mongoose";
import { Expense } from "../../src/models/expenses";

const TEST_MONGO_URI = process.env.MONGO_URI?.replace('expenses-db', 'expenses-test-db');

describe("API Tests - In-Process (Integration)", () => {
    
    beforeAll(async () => {
        if (mongoose.connection.readyState === 0 && TEST_MONGO_URI) {
            await mongoose.connect(TEST_MONGO_URI);
        }
        await Expense.deleteMany({});
    }, 30000);

    afterAll(async () => {
        await Expense.deleteMany({});
        await mongoose.disconnect();
    }, 30000);

    // ========== HEALTH CHECK ==========
    
    test("GET /health debe devolver 200 OK", async () => {
        const res = await app.request("/health");
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toHaveProperty("status", "ok");
    });

    // ========== CREATE EXPENSE (POST) ==========

    test("POST /api/v1/expenses debe crear un gasto válido", async () => {
        const payload = {
            description: "Test Gasto Válido",
            totalAmount: 50,
            currency: "EUR",
            payerId: "user_test_1",
            groupId: "group_test_create",
            shares: [{ userId: "user_test_1", amount: 50 }]
        };

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
        expect(body.data.description).toBe("Test Gasto Válido");
        expect(body.data.totalAmount).toBe(50);
    });

    test("POST /api/v1/expenses debe rechazar gasto sin description", async () => {
        const payload = {
            totalAmount: 50,
            currency: "EUR",
            payerId: "user_test_1",
            groupId: "group_test",
            shares: [{ userId: "user_test_1", amount: 50 }]
        };

        const res = await app.request("/api/v1/expenses", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-User-Plan": "PRO" 
            },
            body: JSON.stringify(payload)
        });

        expect(res.status).toBe(400);
    });

    test("POST /api/v1/expenses debe rechazar gasto sin totalAmount", async () => {
        const payload = {
            description: "Sin monto",
            currency: "EUR",
            payerId: "user_test_1",
            groupId: "group_test",
            shares: [{ userId: "user_test_1", amount: 50 }]
        };

        const res = await app.request("/api/v1/expenses", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-User-Plan": "PRO" 
            },
            body: JSON.stringify(payload)
        });

        expect(res.status).toBe(400);
    });

    test("POST /api/v1/expenses debe rechazar monto negativo", async () => {
        const payload = {
            description: "Monto negativo",
            totalAmount: -50,
            currency: "EUR",
            payerId: "user_test_1",
            groupId: "group_test",
            shares: [{ userId: "user_test_1", amount: -50 }]
        };

        const res = await app.request("/api/v1/expenses", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-User-Plan": "PRO" 
            },
            body: JSON.stringify(payload)
        });

        expect(res.status).toBe(400);
    });

    // ========== GET EXPENSES ==========

    test("GET /api/v1/expenses/groups/:id debe listar gastos del grupo", async () => {
        const groupId = "group_test_list";
        
        // Primero crear un gasto
        await app.request("/api/v1/expenses", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-User-Plan": "PRO" 
            },
            body: JSON.stringify({
                description: "Gasto para listar",
                totalAmount: 30,
                currency: "EUR",
                payerId: "user1",
                groupId: groupId,
                shares: [{ userId: "user1", amount: 30 }]
            })
        });

        const res = await app.request(`/api/v1/expenses/groups/${groupId}`);
        const body: any = await res.json();

        expect(res.status).toBe(200);
        expect(body.data).toBeInstanceOf(Array);
        expect(body.data.length).toBeGreaterThan(0);
    });

    test("GET /api/v1/expenses/groups/:id debe devolver array vacío si no hay gastos", async () => {
        const res = await app.request("/api/v1/expenses/groups/grupo_inexistente_xyz");
        const body: any = await res.json();

        expect(res.status).toBe(200);
        expect(body.data).toBeInstanceOf(Array);
        expect(body.data).toHaveLength(0);
    });

    // ========== BALANCES ==========

    test("GET /api/v1/balances/:groupId debe calcular balances correctamente", async () => {
        const groupId = "group_test_balance";
        
        // Crear gasto: Paco paga 100, split con Ana
        await app.request("/api/v1/expenses", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-User-Plan": "PRO" 
            },
            body: JSON.stringify({
                description: "Cena",
                totalAmount: 100,
                currency: "EUR",
                payerId: "paco",
                groupId: groupId,
                shares: [
                    { userId: "paco", amount: 50 },
                    { userId: "ana", amount: 50 }
                ]
            })
        });

        const res = await app.request(`/api/v1/balances/${groupId}`);
        const body: any = await res.json();

        expect(res.status).toBe(200);
        expect(body.data.balances).toBeDefined();
        expect(body.data.balances["paco"]).toBe(50); // Paco le deben 50
        expect(body.data.balances["ana"]).toBe(-50); // Ana debe 50
    });

    test("GET /api/v1/balances/:groupId debe devolver balances vacíos para grupo sin gastos", async () => {
        const res = await app.request("/api/v1/balances/grupo_vacio_test");
        const body: any = await res.json();

        expect(res.status).toBe(200);
        expect(body.data.balances).toEqual({});
        expect(body.data.payments).toEqual([]);
    });

    // ========== DELETE ==========

    test("DELETE /api/v1/expenses/:id debe eliminar un gasto existente", async () => {
        // Primero crear
        const createRes = await app.request("/api/v1/expenses", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-User-Plan": "PRO" 
            },
            body: JSON.stringify({
                description: "Gasto a borrar",
                totalAmount: 25,
                currency: "EUR",
                payerId: "user1",
                groupId: "group_delete_test",
                shares: [{ userId: "user1", amount: 25 }]
            })
        });
        const createBody: any = await createRes.json();
        const expenseId = createBody.data._id;

        // Luego borrar
        const deleteRes = await app.request(`/api/v1/expenses/${expenseId}`, {
            method: "DELETE"
        });

        expect(deleteRes.status).toBe(200);

        // Verificar que ya no existe
        const dbExpense = await Expense.findById(expenseId);
        expect(dbExpense).toBeNull();
    });

    test("DELETE /api/v1/expenses/:id debe devolver 404 para ID inexistente", async () => {
        const fakeId = "000000000000000000000000"; // ObjectId válido pero no existe
        
        const res = await app.request(`/api/v1/expenses/${fakeId}`, {
            method: "DELETE"
        });

        expect(res.status).toBe(404);
    });
});