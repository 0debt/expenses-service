import { describe, expect, test, mock } from "bun:test";
import { generatePayments } from "../src/services/balance.service";



describe("Algoritmo de Deuda (Expenses Service)", () => {
    
    test("Debe simplificar una deuda directa simple", () => {
        // Escenario: Paco pagó 100€ por Paloma
        // Balance: Paco (+50), Paloma (-50) -> Asumiendo split 50/50 de 100 total
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
        // Escenario: A debe 10 a B, B debe 10 a C.
        // Matemáticamente: A (-10), B (0), C (+10)
        // El algoritmo debería decir "A paga 10 a C" directamente.
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
});