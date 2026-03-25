import "dotenv/config";
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
import rankingRouter from "./routes/rankingRouter.js";
import { setupRoomSocket } from "./server/roomSocket.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = createServer(app);
const io = new WebSocketServer(server);
const port = process.env.PORT || 3000;

const isDevelopment = process.env.NODE_ENV !== 'production';

app.use(cors({
    origin: isDevelopment ? true : process.env.ALLOWED_ORIGINS?.split(',') || false,
    credentials: true
}));

if (isDevelopment) {
    app.use(helmet({
        contentSecurityPolicy: false,
        hsts: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    }));
} else {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                "img-src": ["'self'", "data:", "https:"],
                "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
                "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "data:"],
                "connect-src": ["'self'", "wss:", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                "default-src": ["'self'"]
            }
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    }));
}
app.use(morgan("dev"));
app.use(cookieParser());

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(authRouter);
app.use(roomRouter);
app.use(rankingRouter);

app.get("/test", (req, res) => {
    res.json({ 
        status: "OK", 
        message: "Servidor funcionando correctamente",
        ip: req.ip,
        headers: req.headers
    });
});

// Endpoint para detectar país del usuario (para P2P)
app.get("/api/geo", async (req, res) => {
    try {
        // En localhost, devolver país por defecto
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
        
        if (isLocalhost) {
            return res.json({ country_code: 'ar' }); // Default para desarrollo local
        }

        // En producción, usar servicio de geolocalización
        const response = await fetch(`https://ipapi.co/${clientIp}/json/`);
        if (response.ok) {
            const data = await response.json();
            return res.json({ country_code: (data.country_code || 'ar').toLowerCase() });
        }
        
        res.json({ country_code: 'ar' });
    } catch (e) {
        console.error('Geo detection error:', e);
        res.json({ country_code: 'ar' });
    }
});

app.get("/", auth.requireAuth, (req, res) => {
    res.render("index", { title: "Snake Soccer", user: req.user });
});

app.use(auth.requireAdmin, taskRouter);
app.use(error.c404);

setupRoomSocket(io);
roomController.setIO(io);

server.listen(port, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
    console.log(`Acceso desde red local: http://<tu-ip-local>:${port}`);
});
