import { Hono } from "hono";
import expensesControllers from "./controllers/expensesControllers.ts"; 

//Inicializamos el servidor
const app = new Hono();

app.route("/", expensesControllers);

//SERVER
const port = 3000
console.log(`Server is running on port ${port}`);
export default {
    port: port,
    fetch: app.fetch,
}


