import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}))

app.use(
    express.json({
        limit: "16kb"
    })
)

app.use(express.urlencoded({
    extended: true,
    limit: "16kb"
}))

app.get('/hello', (req, res) => {
    res.send('Hello World!');
});

app.use(express.static("public"))
app.use(cookieParser())

import  UserRouter  from "./routes/user.routes";
app.use('/api/v1/users',UserRouter)

export {app}