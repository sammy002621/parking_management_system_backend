import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mainRouter from './routes/index.js';
import { errorHandler } from './middlewares/errorMiddleware.js';

dotenv.config();

const app = express();

// Middlewares
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*", // Configure for your frontend URL in production
  credentials: true
}));
app.use(express.json({limit: "16kb"}));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public")); // If you have a public folder for static assets

// Routes
app.get('/', (req, res) => res.send('Vehicle Parking Management API Running!'));
app.use('/api/v1', mainRouter); // Prefix all API routes with /api/v1

// Error Handler Middleware (should be last)
app.use(errorHandler);

export default app;

// i think that we should create a know admin as the app starts 