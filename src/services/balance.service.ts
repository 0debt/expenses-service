import { Expense } from "../models/expenses.ts"; 

// Interfaz para el resultado: { "userId1": 50, "userId2": -50 }
interface BalanceMap {
    [userId: string]: number;
}

// Nueva interfaz para definir "Quién paga a Quién"
export interface PaymentInstruction {
    from: string; // El deudor
    to: string;   // El acreedor
    amount: number;
}

// 1. Función auxiliar para redondear a 2 decimales y evitar errores tipo 0.0000004
const round = (num: number) => Math.round(num * 100) / 100;

export const calculateGroupBalance = async (groupId: string): Promise<BalanceMap> => {
    // 1. Obtenemos todos los gastos del grupo
    const expenses = await Expense.find({ groupId });

    // 2. Inicializamos el mapa de balances
    const balances: BalanceMap = {};

    // 3. Recorremos cada gasto para ajustar las cuentas
    expenses.forEach((expense) => {
        
        // A) EL PAGADOR (Payer):
        // Como él puso el dinero, el grupo le "debe" el total de lo que pagó.
        // Sumamos al su saldo.
        const payerId = expense.payerId;
        if (!balances[payerId]) balances[payerId] = 0;
        balances[payerId] += expense.totalAmount;

        // B) LOS CONSUMIDORES (Shares):
        // A cada persona que participó, le restamos su parte.
        // Porque esa parte es "deuda" que han contraído.
        expense.shares.forEach((share) => {
            const userId = share.userId;
            if (!balances[userId]) balances[userId] = 0;
            
            // Restamos lo que le correspondía pagar
            balances[userId] -= share.amount;
        });
    });

    // Limpiamos decimales
    for (const user in balances) {
        balances[user] = round(balances[user] ?? 0);
    }
    return balances;
};

// El Algoritmo de Simplificación de Deuda
export const generatePayments = (balances: BalanceMap): PaymentInstruction[] => {
    const payments: PaymentInstruction[] = [];
    
    // Separamos en dos listas
    let debtors = [];
    let creditors = [];

    for (const [user, amount] of Object.entries(balances)) {
        if (amount < -0.01) debtors.push({ user, amount }); // Debe dinero
        if (amount > 0.01) creditors.push({ user, amount });  // Le deben dinero
    }

    // Ordenamos para atacar las deudas más grandes primero (Optimización)
    debtors.sort((a, b) => a.amount - b.amount); // Ascendente (ej: -100 antes que -10)
    creditors.sort((a, b) => b.amount - a.amount); // Descendente (ej: 100 antes que 10)

    let i = 0; // Índice deudores
    let j = 0; // Índice acreedores

    // Mientras queden personas en ambas listas...
    while (i < debtors.length && j < creditors.length) {
        let debtor = debtors[i] ??  { user: "", amount: 0 };
        let creditor = creditors[j] ?? { user: "", amount: 0 };

        // Calculamos cuánto se puede pagar:
        // Es el mínimo entre "lo que debe el deudor" (en positivo) y "lo que le deben al acreedor"
        let amount = Math.min(Math.abs(debtor.amount), creditor.amount);
        amount = round(amount);

        // Creamos la instrucción de pago
        payments.push({
            from: debtor.user,
            to: creditor.user,
            amount: amount
        });

        // Ajustamos los saldos restantes
        debtor.amount += amount; // Se acerca a 0
        creditor.amount -= amount; // Se acerca a 0
        
        debtor.amount = round(debtor.amount);
        creditor.amount = round(creditor.amount);

        // Si el deudor ya pagó todo, pasamos al siguiente deudor
        if (Math.abs(debtor.amount) < 0.01) {
            i++;
        }

        // Si al acreedor ya le pagaron todo, pasamos al siguiente acreedor
        if (creditor.amount < 0.01) {
            j++;
        }
    }

    return payments;
};