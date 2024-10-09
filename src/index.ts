import { app } from "./app";
import dotenv from 'dotenv'
import connectDB from "./db";

dotenv.config({
    path:'../env'
})

connectDB()
.then(() => {
    app.listen(process.env.PORT || 8000,() => {
        console.log(`app listening on ${process.env.PORT}`)
    })
})
.catch((err) => {
    console.log("MOONGO db connection failed",err)
})