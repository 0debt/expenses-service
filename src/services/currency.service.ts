// Servicio para gestionar el cambio de divisas usando Frankfurter API
// Documentación: https://www.frankfurter.app/docs/

interface ConversionResult {
    amount: number;
    rate: number;
}

export const convertCurrency = async (
    amount: number, 
    from: string, 
    to: string = 'EUR'
): Promise<ConversionResult> => {
    
    // 1. Si la moneda es la misma, no llamamos a la API (ahorro de tiempo)
    if (from === to) {
        return { amount: amount, rate: 1 };
    }

    try {
        // 2. Llamada a la API Externa (Requisito V2)
        // Ejemplo: https://api.frankfurter.app/latest?amount=100&from=USD&to=EUR
        const response = await fetch(
            `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`
        );

        if (!response.ok) {
            throw new Error(`Error external API: ${response.statusText}`);
        }

        const data: any = await response.json();
        
        // Frankfurter devuelve algo como: { rates: { EUR: 92.5 } }
        const convertedAmount = data.rates[to];
        // Calculamos la tasa inversa para guardarla
        const rate = convertedAmount / amount;

        return {
            amount: convertedAmount,
            rate: rate
        };

    } catch (error) {
        console.error("⚠️ Fallo en Frankfurter API, usando fallback 1:1", error);
        // Fallback: Si falla la API, asumimos 1:1 para no romper la app (Resiliencia)
        return { amount: amount, rate: 1 };
    }
};