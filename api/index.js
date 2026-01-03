// Vercel serverless function entry point for API routes
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import app from '../app.js';

// Cache connection promise to reuse across invocations
let cachedConnection = null;

const connectDatabase = async () => {
    // If already connected, return immediately
    if (mongoose.connection.readyState === 1) {
        return;
    }

    // If connection is in progress, wait for it
    if (cachedConnection) {
        console.log('⏳ Reusing existing connection promise...');
        try {
            await cachedConnection;
            return;
        } catch (error) {
            console.warn('⚠️ Previous connection failed, starting new one:', error.message);
            cachedConnection = null;
        }
    }

    // Start new connection
    console.log('🔄 Starting database connection...');
    console.log('MongoDB URI present:', !!process.env.MONGODB_URI);
    
    cachedConnection = (async () => {
        try {
            await connectDB();
            console.log('✅ Database connected');
            return true;
        } catch (error) {
            console.error('❌ Database connection error:', error);
            console.error('Error details:', {
                message: error.message,
                name: error.name,
                code: error.code,
                readyState: mongoose.connection.readyState
            });
            cachedConnection = null;
            throw error;
        }
    })();

    // Wait for connection with shorter timeout
    try {
        await Promise.race([
            cachedConnection,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection timeout after 20 seconds')), 20000)
            )
        ]);
    } catch (error) {
        cachedConnection = null;
        throw error;
    }
};

// Helper function to set CORS headers
const setCORSHeaders = (res, origin) => {
    // Get allowed origins
    const getAllowedOrigins = () => {
        const origins = [];
        if (process.env.FRONTEND_URL) {
            const urls = process.env.FRONTEND_URL.split(',').map(url => url.trim()).filter(Boolean);
            origins.push(...urls);
        }
        if (process.env.VERCEL_URL) {
            origins.push(`https://${process.env.VERCEL_URL}`);
        }
        // Always allow common frontend patterns
        origins.push('https://mobile-billing-frontend.vercel.app');
        return origins;
    };
    
    const allowedOrigins = getAllowedOrigins();
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Determine if origin should be allowed
    let allowOrigin = origin || '*';
    
    if (origin) {
        // Check exact match
        if (allowedOrigins.includes(origin)) {
            allowOrigin = origin;
        } 
        // Check Vercel preview pattern (mobile-billing-frontend-*.vercel.app)
        else if (origin.includes('mobile-billing-frontend') && origin.includes('.vercel.app')) {
            allowOrigin = origin;
        }
        // If no FRONTEND_URL configured, allow all (for initial setup)
        else if (allowedOrigins.length <= 2) { // Only has default patterns
            console.warn(`⚠️ Allowing origin ${origin} - FRONTEND_URL not configured`);
            allowOrigin = origin;
        }
        // Production: allow if explicitly configured
        else if (isProduction) {
            console.warn(`🚫 Blocking origin: ${origin}`);
            allowOrigin = allowedOrigins[0] || '*'; // Fallback to first allowed or all
        }
    }
    
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
};

// Export as Vercel serverless function
// Vercel automatically detects functions in the /api directory
export default async (req, res) => {
    const startTime = Date.now();
    const origin = req.headers.origin;
    
    // Log request details for debugging
    console.log(`📥 ${req.method} ${req.url}`);
    console.log('Origin:', origin);
    console.log('Function called successfully!');
    console.log('Request path:', req.path);
    console.log('Request query:', req.query);
    
    // Set CORS headers IMMEDIATELY (before any errors or processing)
    setCORSHeaders(res, origin);
    
    // Handle OPTIONS preflight requests immediately
    if (req.method === 'OPTIONS') {
        console.log('✅ Handling OPTIONS preflight');
        return res.status(200).end();
    }
    
    // Simple test endpoint to verify function is working
    // Handle both /api/test and /test (Vercel might strip /api prefix)
    if (req.url === '/api/test' || req.url === '/test' || req.url.startsWith('/test')) {
        return res.status(200).json({
            message: 'Function is working!',
            method: req.method,
            url: req.url,
            path: req.path,
            timestamp: new Date().toISOString()
        });
    }
    
    try {
        // Connect to database (with timeout handling)
        try {
            console.log('🔌 Attempting database connection...');
            await connectDatabase();
            console.log('✅ Database connection successful');
        } catch (dbError) {
            console.error('❌ Database connection failed:', dbError);
            console.error('Error details:', {
                name: dbError.name,
                message: dbError.message,
                code: dbError.code,
                readyState: mongoose.connection.readyState
            });
            
            // Return detailed error for debugging
            return res.status(503).json({
                message: 'Database connection failed',
                error: dbError.message,
                errorName: dbError.name,
                errorCode: dbError.code,
                readyState: mongoose.connection.readyState,
                hint: 'Check MongoDB Atlas connection string and IP whitelist (0.0.0.0/0)',
                hasMongoDBURI: !!process.env.MONGODB_URI,
                mongoDBUriLength: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0
            });
        }
        
        // Verify connection state
        if (mongoose.connection.readyState !== 1) {
            console.error('❌ Connection state invalid:', mongoose.connection.readyState);
            return res.status(503).json({
                message: 'Database connection failed',
                readyState: mongoose.connection.readyState,
                error: 'Connection state is not ready',
                hint: 'Database connection completed but state is invalid'
            });
        }
        
        // Try a quick ping to verify connection is actually working
        try {
            await mongoose.connection.db.admin().ping();
            console.log('✅ Database ping successful');
        } catch (pingError) {
            console.error('❌ Database ping failed:', pingError.message);
            return res.status(503).json({
                message: 'Database connection verification failed',
                error: pingError.message,
                readyState: mongoose.connection.readyState,
                hint: 'Connection exists but ping failed - check MongoDB Atlas status'
            });
        }

        console.log('✅ Database ready, processing request...');
        
        // Handle request with Express
        return new Promise((resolve) => {
            let responseSent = false;
            const timeout = setTimeout(() => {
                if (!responseSent) {
                    responseSent = true;
                    if (!res.headersSent) {
                        res.status(504).json({ message: 'Request timeout' });
                    }
                    resolve();
                }
            }, 25000); // 25 second timeout
            
            const cleanup = () => {
                clearTimeout(timeout);
                if (!responseSent) {
                    responseSent = true;
                    const duration = Date.now() - startTime;
                    console.log(`✅ ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
                    resolve();
                }
            };
            
            res.on('finish', cleanup);
            res.on('close', cleanup);
            res.on('error', (err) => {
                console.error('❌ Response error:', err);
                cleanup();
            });
            
            try {
                app(req, res);
            } catch (err) {
                console.error('❌ Express handler error:', err);
                if (!responseSent && !res.headersSent) {
                    res.status(500).json({
                        message: err.message || 'Internal server error',
                        error: process.env.NODE_ENV === 'production' ? null : err.message
                    });
                }
                cleanup();
            }
        });
    } catch (error) {
        console.error('❌ Serverless function error:', error);
        console.error('Error:', {
            name: error.name,
            message: error.message,
            code: error.code
        });
        
        if (!res.headersSent) {
            res.status(503).json({
                message: 'Database connection failed',
                error: error.message,
                hint: 'Please check MongoDB Atlas connection string and IP whitelist (0.0.0.0/0)'
            });
        }
    }
};

