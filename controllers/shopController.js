import Shop from '../models/Shop.js';

// @desc    Get Shop Settings
// @route   GET /api/shop
// @access  Private
export const getShopSettings = async (req, res) => {
    try {
        // Import mongoose to check connection
        const mongoose = (await import('mongoose')).default;
        
        // Check if mongoose is connected
        if (mongoose.connection.readyState !== 1) {
            console.error('❌ Database not connected. State:', mongoose.connection.readyState);
            return res.status(503).json({ 
                message: 'Database not connected',
                readyState: mongoose.connection.readyState,
                hint: 'Check MongoDB Atlas IP whitelist - add 0.0.0.0/0 to allow all IPs'
            });
        }

        // Verify connection with a quick operation
        try {
            await mongoose.connection.db.admin().ping();
        } catch (pingError) {
            console.error('❌ Database ping failed:', pingError.message);
            return res.status(503).json({ 
                message: 'Database connection lost',
                error: pingError.message
            });
        }

        // We assume only one shop document exists.
        let shop = await Shop.findOne();

        // If no shop settings exist, create default
        if (!shop) {
            console.log('📝 Creating default shop settings...');
            shop = await Shop.create({});
        }

        res.json(shop);
    } catch (error) {
        console.error("❌ Get shop settings error:", error);
        console.error("Error details:", {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack?.substring(0, 500)
        });
        
        // Check if it's a MongoDB connection error
        if (error.name === 'MongoServerError' || error.name === 'MongooseError' || error.message?.includes('connection')) {
            return res.status(503).json({ 
                message: 'Database connection error',
                error: process.env.NODE_ENV === 'production' ? null : error.message,
                type: error.name,
                hint: 'Check MongoDB Atlas IP whitelist and connection string'
            });
        }
        
        res.status(500).json({ 
            message: error.message || 'Error fetching shop settings',
            error: process.env.NODE_ENV === 'production' ? null : error.message,
            type: error.name || 'Error'
        });
    }
};

// @desc    Update Shop Settings
// @route   PUT /api/shop
// @access  Private/Admin
export const updateShopSettings = async (req, res) => {
    try {
        const { name, address, mobile, email, gstin, logo, terms } = req.body;

        let shop = await Shop.findOne();

        if (shop) {
            shop.name = name || shop.name;
            shop.address = address || shop.address;
            shop.mobile = mobile || shop.mobile;
            shop.email = email || shop.email;
            shop.gstin = gstin || shop.gstin;
            shop.logo = logo || shop.logo; // handle empty string if clearing?
            shop.terms = terms || shop.terms;

            const updatedShop = await shop.save();
            res.json(updatedShop);
        } else {
            const newShop = await Shop.create({
                name,
                address,
                mobile,
                email,
                gstin,
                logo,
                terms
            });
            res.status(201).json(newShop);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
