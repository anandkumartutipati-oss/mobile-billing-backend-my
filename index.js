import 'dotenv/config';
import os from 'os';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import app from './app.js';

const PORT = process.env.PORT || 5002;

// Get Local Network IP Address
const getNetworkIP = () => {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '0.0.0.0';
};

// For traditional server deployment (not Vercel)
// Vercel uses api/index.js as the serverless function entry point
const startServer = async () => {
    try {
        // Validate required environment variables
        const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
            console.error('Please check your .env file');
            process.exit(1);
        }

        // 1. First Connect to Database
        await connectDB();

        // 2. Then Start the Server
        const server = app.listen(PORT, '0.0.0.0', () => {
            const networkIP = getNetworkIP();
            const mode = process.env.NODE_ENV || 'development';

            console.log(`\n🚀 Server is running in ${mode} mode`);
            console.log(`🏠 Local:   http://localhost:${PORT}`);
            if (mode === 'development') {
                console.log(`🌐 Network: http://${networkIP}:${PORT}`);
            }
            console.log(`📝 API:     http://localhost:${PORT}/api`);
            if (mode === 'production') {
                console.log(`✅ Production mode - Serving React app from client/dist`);
            }
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM signal received: closing HTTP server');
            server.close(() => {
                console.log('HTTP server closed');
                mongoose.connection.close(false, () => {
                    console.log('MongoDB connection closed');
                    process.exit(0);
                });
            });
        });

    } catch (error) {
        console.error(`❌ Error during server startup: ${error.message}`);
        process.exit(1);
    }
};

startServer();
