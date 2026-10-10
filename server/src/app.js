
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import config from './config/env.js';
import errorHandler from './middleware/errorHandler.js';
import notFound from './middleware/notFound.js';
import ApiResponse from './utils/ApiResponse.js';
import authRoutes from './routes/auth.routes.js';
import goalRoutes from './routes/goal.routes.js';
import nodeRoutes from './routes/node.routes.js';
import noteRoutes from './routes/note.routes.js';
import fileRoutes from './routes/file.routes.js';
import scheduledTaskRoutes from './routes/scheduledTask.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import aiRoutes from './routes/ai.routes.js';
import aiSyllabusRoutes from './routes/aiSyllabus.routes.js';
import sessionRoutes from './routes/session.routes.js';


const app = express();

// Security headers — applied first, before anything else touches the request
app.use(helmet());

// Only the configured frontend origin may call this API, and credentials
// (the httpOnly refresh cookie) are allowed across that origin
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);

// Body parsers — size-capped to blunt trivial payload-flooding attempts
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(cookieParser());

// Request logging — dev only, never in production
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// Health check — proves config, the response shape, and (once wired in
// server.js) the DB connection all work together end to end
app.get('/api/v1/health', (req, res) => {
  res
    .status(200)
    .json(new ApiResponse(200, { uptime: process.uptime() }, 'Preplytics API is healthy'));
});

// Feature routes get mounted here as each phase is built, e.g.:
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/goals', goalRoutes);
app.use('/api/v1/nodes', nodeRoutes);
app.use('/api/v1/notes', noteRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1', scheduledTaskRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/goals/:goalId', aiSyllabusRoutes);
app.use('/api/v1/sessions', sessionRoutes);


// Anything that reaches this point matched no real route
app.use(notFound);

// Must be mounted last — Express identifies error middleware by its
// 4-argument signature, and only routes here via next(err)
app.use(errorHandler);

export default app;