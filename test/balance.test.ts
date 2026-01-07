import { describe, expect, test } from "bun:test";
import { generatePayments } from "../src/services/balance.service";

describe("Algoritmo de Deuda (Expenses Service)", () => {
    
    // ========== ESCENARIOS POSITIVOS ==========
    
    test("Debe simplificar una deuda directa simple", () => {
        const balances = {
            "Paco": 50,
            "Paloma": -50
        };

        const result = generatePayments(balances);

        expect(result).toHaveLength(1);
        expect(result[0].from).toBe("Paloma");
        expect(result[0].to).toBe("Paco");
        expect(result[0].amount).toBe(50);
    });

    test("Debe resolver una deuda circular (A->B->C)", () => {
        const balances = {
            "A": -10,
            "B": 0,
            "C": 10
        };

        const result = generatePayments(balances);

        expect(result).toHaveLength(1);
        expect(result[0].from).toBe("A");
        expect(result[0].to).toBe("C");
        expect(result[0].amount).toBe(10);
    });

    test("No debe generar pagos si todo está saldado", () => {
        const balances = {
            "A": 0,
            "B": 0
        };
        const result = generatePayments(balances);
        expect(result).toHaveLength(0);
    });

    test("Debe manejar múltiples deudores y un solo acreedor", () => {
        const balances = {
            "Carlos": 100,
            "Ana": -60,
            "Luis": -40
        };

        const result = generatePayments(balances);

        expect(result).toHaveLength(2);
        const totalPagos = result.reduce((sum, p) => sum + p.amount, 0);
        expect(totalPagos).toBe(100);
    });

    test("Debe manejar un solo deudor y múltiples acreedores", () => {
        const balances = {
            "María": -100,
            "Juan": 60,
            "Pedro": 40
        };

        const result = generatePayments(balances);

        expect(result).toHaveLength(2);
        const pagosDeMaría = result.filter(p => p.from === "María");
        expect(pagosDeMaría).toHaveLength(2);
    });

    test("Debe simplificar deudas complejas de grupo grande", () => {
        const balances = {
            "Paco": 150,
            "Paloma": -50,
            "Ana": -30,
            "Luis": -70
        };

        const result = generatePayments(balances);

        result.forEach(payment => {
            expect(payment.to).toBe("Paco");
        });

        const total = result.reduce((sum, p) => sum + p.amount, 0);
        expect(total).toBe(150);
    });

    test("Debe manejar cantidades con decimales correctamente", () => {
        const balances = {
            "A": 33.33,
            "B": -16.67,
            "C": -16.66
        };

        const result = generatePayments(balances);

        expect(result.length).toBeGreaterThan(0);
        result.forEach(payment => {
            expect(payment.amount).toBeGreaterThan(0);
        });
    });

    // ========== ESCENARIOS NEGATIVOS / EDGE CASES ==========

    test("Debe manejar objeto de balances vacío", () => {
        const balances = {};
        const result = generatePayments(balances);
        expect(result).toHaveLength(0);
    });

    test("Debe manejar un solo usuario sin deudas", () => {
        const balances = {
            "SoloUser": 0
        };
        const result = generatePayments(balances);
        expect(result).toHaveLength(0);
    });

    test("Debe manejar balances que suman exactamente cero", () => {
        const balances = {
            "A": 100,
            "B": -50,
            "C": -30,
            "D": -20
        };

        const result = generatePayments(balances);

        const sumaBalances = Object.values(balances).reduce((a, b) => a + b, 0);
        expect(sumaBalances).toBe(0);
        expect(result.length).toBeGreaterThan(0);
    });
});