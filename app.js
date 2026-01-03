import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import purchaseRoutes from './routes/purchaseRoutes.js';
import shopRoutes from './routes/shopRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import offerRoutes from './routes/offerRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Determine allowed origins based on environment
const isProduction = process.env.NODE_ENV === 'production';

// Build allowed origins array
const getAllowedOrigins = () => {
    const origins = [];
    
    if (isProduction) {
        // Production: Use environment variable(s)
        if (process.env.FRONTEND_URL) {
            // Support multiple URLs separated by comma
            const urls = process.env.FRONTEND_URL.split(',').map(url => url.trim()).filter(Boolean);
            origins.push(...urls);
        }
        
        // Also allow Vercel preview URLs if VERCEL_URL is set
        if (process.env.VERCEL_URL) {
            origins.push(`https://${process.env.VERCEL_URL}`);
        }
        
        // Allow Vercel deployment URLs
        if (process.env.VERCEL) {
            // Vercel automatically sets VERCEL_URL for deployments
            if (process.env.VERCEL_URL) {
                origins.push(`https://${process.env.VERCEL_URL}`);
            }
        }
        
        // Always allow common Vercel frontend patterns
        origins.push('https://mobile-billing-frontend.vercel.app');
        // Note: Vercel preview URLs are handled by pattern matching below
        
        // If no origins specified, log warning but allow all (for initial setup)
        if (origins.length === 0) {
            console.warn('⚠️  WARNING: No FRONTEND_URL specified in production. CORS will allow all origins.');
            return true; // Allow all in production if not configured (for initial setup)
        }
        
        return origins;
    } else {
        // Development: Allow common localhost ports
        return [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:5174',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5174'
        ];
    }
};

const allowedOrigins = getAllowedOrigins();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS Configuration
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, Postman, or server-to-server requests)
        if (!origin) {
            return callback(null, true);
        }
        
        // If allowedOrigins is true (allow all), permit the request
        if (allowedOrigins === true) {
            return callback(null, true);
        }
        
        // Check if origin is in allowed list (exact match)
        if (Array.isArray(allowedOrigins) && allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }
        
        // Check for Vercel preview URL patterns (mobile-billing-frontend-*.vercel.app)
        if (origin.includes('mobile-billing-frontend') && origin.includes('.vercel.app')) {
            return callback(null, true);
        }
        
        // In development, allow all origins
        if (!isProduction) {
            return callback(null, true);
        }
        
        // Log blocked origin for debugging
        console.warn(`🚫 CORS blocked origin: ${origin}`);
        console.log(`✅ Allowed origins: ${JSON.stringify(allowedOrigins)}`);
        
        // For now, allow all in production if not configured (to fix CORS issues)
        // TODO: Remove this and properly configure FRONTEND_URL
        console.warn('⚠️  Allowing origin due to missing configuration');
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400 // 24 hours
}));

// Security Headers
app.use(helmet({
    contentSecurityPolicy: isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false
}));

// Logging
app.use(morgan(isProduction ? 'combined' : 'dev'));

// Basic Route
app.get('/', (req, res) => {
    res.json({ 
        message: 'Mobile Shop Billing API is running...',
        environment: process.env.NODE_ENV || 'development',
        hasMongoDB: !!process.env.MONGODB_URI,
        hasJWT: !!process.env.JWT_SECRET,
        hasCloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
        timestamp: new Date().toISOString(),
        vercel: !!process.env.VERCEL
    });
});

// Health check endpoint (before API routes)
app.get('/api/health', (req, res) => {
    const readyState = mongoose.connection.readyState;
    const stateMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    
    res.json({ 
        status: readyState === 1 ? 'ok' : 'degraded',
        environment: process.env.NODE_ENV || 'development',
        database: {
            state: stateMap[readyState] || 'unknown',
            readyState: readyState,
            host: mongoose.connection.host || null,
            name: mongoose.connection.name || null
        },
        hasMongoDB: !!process.env.MONGODB_URI,
        hasJWT: !!process.env.JWT_SECRET,
        hasCloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
        timestamp: new Date().toISOString(),
        vercel: !!process.env.VERCEL,
        mongoDBUriLength: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
        jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0
    });
});

// Database connection test endpoint (before other routes to avoid middleware issues)
app.get('/api/test-db', async (req, res) => {
    try {
        const readyState = mongoose.connection.readyState;
        const stateMap = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        
        if (readyState !== 1) {
            return res.status(503).json({
                status: 'error',
                message: 'Database not connected',
                readyState: readyState,
                state: stateMap[readyState] || 'unknown',
                hasMongoDBURI: !!process.env.MONGODB_URI,
                mongoDBUriLength: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0
            });
        }
        
        // Try to ping the database
        await mongoose.connection.db.admin().ping();
        
        res.json({
            status: 'success',
            message: 'Database connection is working',
            readyState: readyState,
            host: mongoose.connection.host,
            database: mongoose.connection.name,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            message: 'Database ping failed',
            error: error.message,
            errorName: error.name,
            errorCode: error.code,
            readyState: mongoose.connection.readyState
        });
    }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/offers', offerRoutes);

// Static Folder for Uploads
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

// Serve static files from React app in production (only if not on Vercel)
// Vercel handles static file serving separately via vercel.json rewrites
if (isProduction && !process.env.VERCEL && !process.env.VERCEL_URL) {
    const clientBuildPath = path.join(__dirname, '../client/dist');
    app.use(express.static(clientBuildPath));
    
    // Serve React app for all non-API routes
    // Use a proper catch-all pattern that works with Express 5.x
    // Regex pattern: match all routes except those starting with /api
    app.get(/^(?!\/api).*/, (req, res) => {
        // Double-check: Don't serve React app for API routes
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ message: 'API route not found' });
        }
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
}

// Error Handling Middleware
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);
    res.json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

export default app;
