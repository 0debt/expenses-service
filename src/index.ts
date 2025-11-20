import { Hono } from "hono";
import expensesControllers from "./controllers/expensesControllers.ts"; 
import { connectDB } from "./config/mongo.ts"; 

//Inicializamos el servidor
const app = new Hono();

//Conexión a la BD 
connectDB();

app.route("/", expensesControllers);

//SERVER
const port = 3000
console.log(`Server is running on port ${port}`);
export default {
    port: port,
    fetch: app.fetch,
}


