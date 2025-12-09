import { describe, expect, test } from "bun:test";

// URL real donde corre tu servicio (local o Docker)
const BASE_URL = "http://localhost:3000";

describe("Out-of-Process Tests (E2E)", () => {

    test("El servidor debe estar escuchando en el puerto 3000", async () => {
        try {
            const res = await fetch(`${BASE_URL}/health`);
            expect(res.status).toBe(200);
        } catch (error) {
            throw new Error("El servidor parece apagado. Ejecuta 'bun run dev' antes de lanzar este test.");
        }
    });

    test("Flujo Completo: Crear Gasto -> Ver Balance -> Borrar Gasto", async () => {
        const groupId = "group_e2e_flow";
        let expenseId = "";

        // 1. CREAR GASTO (POST)
        const createRes = await fetch(`${BASE_URL}/api/v1/expenses`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                description: "Gasto E2E Real",
                totalAmount: 100,
                currency: "EUR",
                payerId: "paco",
                groupId: groupId,
                shares: [{ userId: "paco", amount: 50 }, { userId: "pepe", amount: 50 }]
            })
        });
        
        const createBody: any = await createRes.json();
        expect(createRes.status).toBe(201);
        expenseId = createBody.data._id;
        console.log(`Gasto creado: ${expenseId}`);

        // 2. VERIFICAR BALANCE (GET)
        // Esto prueba Redis, Mongo y el Algoritmo a la vez
        const balanceRes = await fetch(`${BASE_URL}/api/v1/balances/${groupId}`);
        const balanceBody: any = await balanceRes.json();
        
        expect(balanceRes.status).toBe(200);
        // Paco pagó 100 y debía 50 -> Balance +50
        expect(balanceBody.data.balances["paco"]).toBe(50);
        console.log(` Balance verificado`);

        // 3. BORRAR GASTO (DELETE)
        const deleteRes = await fetch(`${BASE_URL}/api/v1/expenses/${expenseId}`, {
            method: "DELETE"
        });
        expect(deleteRes.status).toBe(200);
        console.log(`   Gasto eliminado`);
    });
});