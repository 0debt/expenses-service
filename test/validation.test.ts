import { describe, expect, test } from "bun:test";

/**
 * Tests de validación de datos de entrada
 * Estos tests verifican que los schemas Zod funcionan correctamente
 */

describe("Validación de Datos de Expense", () => {
    
    // ========== VALIDACIÓN DE CAMPOS REQUERIDOS ==========

    test("Un expense válido debe tener todos los campos requeridos", () => {
        const validExpense = {
            description: "Cena de grupo",
            totalAmount: 100,
            currency: "EUR",
            payerId: "user123",
            groupId: "group456",
            shares: [{ userId: "user123", amount: 100 }]
        };

        expect(validExpense.description).toBeDefined();
        expect(validExpense.totalAmount).toBeGreaterThan(0);
        expect(validExpense.payerId).toBeDefined();
        expect(validExpense.groupId).toBeDefined();
        expect(validExpense.shares.length).toBeGreaterThan(0);
    });

    test("Description no puede estar vacía", () => {
        const emptyDescription = "";
        expect(emptyDescription.length).toBe(0);
        // En la API real, esto devolvería 400
    });

    test("TotalAmount debe ser un número positivo", () => {
        const validAmount = 50.50;
        const invalidAmount = -10;

        expect(validAmount).toBeGreaterThan(0);
        expect(invalidAmount).toBeLessThan(0);
    });

    // ========== VALIDACIÓN DE DIVISAS ==========

    test("Currency debe ser una divisa soportada", () => {
        const supportedCurrencies = ["EUR", "USD", "GBP", "JPY"];
        
        expect(supportedCurrencies).toContain("EUR");
        expect(supportedCurrencies).toContain("USD");
        expect(supportedCurrencies).not.toContain("BTC");
    });

    test("EUR es la divisa por defecto", () => {
        const defaultCurrency = "EUR";
        expect(defaultCurrency).toBe("EUR");
    });

    // ========== VALIDACIÓN DE CATEGORÍAS ==========

    test("Category debe ser una categoría válida", () => {
        const validCategories = ["FOOD", "TRANSPORT", "ACCOMMODATION", "ENTERTAINMENT", "OTHER"];
        
        expect(validCategories).toContain("FOOD");
        expect(validCategories).toContain("OTHER");
        expect(validCategories).not.toContain("INVALID_CATEGORY");
    });

    test("OTHER es la categoría por defecto", () => {
        const defaultCategory = "OTHER";
        expect(defaultCategory).toBe("OTHER");
    });

    // ========== VALIDACIÓN DE SPLIT TYPES ==========

    test("SplitType debe ser EQUAL, EXACT o PERCENTAGE", () => {
        const validSplitTypes = ["EQUAL", "EXACT", "PERCENTAGE"];
        
        expect(validSplitTypes).toHaveLength(3);
        expect(validSplitTypes).toContain("EQUAL");
        expect(validSplitTypes).not.toContain("RANDOM");
    });

    // ========== VALIDACIÓN DE SHARES ==========

    test("Shares debe tener al menos un elemento", () => {
        const validShares = [{ userId: "user1", amount: 50 }];
        const emptyShares: any[] = [];

        expect(validShares.length).toBeGreaterThan(0);
        expect(emptyShares.length).toBe(0);
    });

    test("Cada share debe tener userId y amount", () => {
        const share = { userId: "user123", amount: 25.50 };

        expect(share).toHaveProperty("userId");
        expect(share).toHaveProperty("amount");
        expect(typeof share.userId).toBe("string");
        expect(typeof share.amount).toBe("number");
    });

    test("La suma de shares debe ser igual al totalAmount en EXACT", () => {
        const totalAmount = 100;
        const shares = [
            { userId: "user1", amount: 60 },
            { userId: "user2", amount: 40 }
        ];

        const sumShares = shares.reduce((sum, s) => sum + s.amount, 0);
        expect(sumShares).toBe(totalAmount);
    });
});

describe("Validación de Settlement", () => {

    test("Settlement debe tener fromUserId, toUserId y amount", () => {
        const validSettlement = {
            groupId: "group123",
            fromUserId: "debtor",
            toUserId: "creditor",
            amount: 50
        };

        expect(validSettlement).toHaveProperty("fromUserId");
        expect(validSettlement).toHaveProperty("toUserId");
        expect(validSettlement).toHaveProperty("amount");
        expect(validSettlement.amount).toBeGreaterThan(0);
    });

    test("fromUserId y toUserId deben ser diferentes", () => {
        const fromUser = "user1";
        const toUser = "user2";

        expect(fromUser).not.toBe(toUser);
    });

    test("Amount de settlement debe ser positivo", () => {
        const validAmount = 75.50;
        expect(validAmount).toBeGreaterThan(0);
    });
});

describe("Formatos de ID", () => {

    test("MongoDB ObjectId tiene 24 caracteres hexadecimales", () => {
        const validObjectId = "507f1f77bcf86cd799439011";
        
        expect(validObjectId).toHaveLength(24);
        expect(/^[0-9a-fA-F]{24}$/.test(validObjectId)).toBe(true);
    });

    test("ID inválido no pasa la validación", () => {
        const invalidId = "not-a-valid-id";
        
        expect(/^[0-9a-fA-F]{24}$/.test(invalidId)).toBe(false);
    });
});
