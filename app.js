import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server as WebSocketServer } from "socket.io";
import error from "./middlewares/error.js";
import auth from "./middlewares/auth.js";
import authRouter from "./routes/authRouter.js";
import taskRouter from "./routes/taskRouter.js";
import roomRouter from "./routes/roomRouter.js";
import roomController from "./controllers/roomController.js";
import { setupRoomSocket } from "./public/js/roomSocket.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = createServer(app);
const io = new WebSocketServer(server);
const port = process.env.PORT || 3000;

app.use(cors());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "img-src": ["'self'", "data:", "https:"],
            "script-src": ["'self'", "'unsafe-inline'", "https:"],
            "connect-src": ["'self'", "ws:", "wss:", "https://cdn.jsdelivr.net"],
            "default-src": ["'self'"]
        }
    }
}));
app.use(morgan("dev"));
app.use(cookieParser());

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(authRouter);
app.use(roomRouter);

app.get("/", auth.requireAuth, (req, res) => {
    res.render("index", { title: "Snake Soccer", user: req.user });
});

app.use(auth.requireAdmin, taskRouter);
app.use(error.c404);

setupRoomSocket(io);
roomController.setIO(io);

server.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
