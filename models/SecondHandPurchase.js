import mongoose from 'mongoose';

const secondHandPurchaseSchema = new mongoose.Schema({
    // Product Details
    name: {
        type: String,
        required: true
    },
    brand: String,
    category: {
        type: String,
        default: 'Mobile Phones'
    },
    simType: {
        type: String,
        enum: ['Single SIM', 'Dual SIM', 'None'],
        default: 'None'
    },
    imei: {
        type: [String],
        required: true
    },
    specifications: String,
    description: String,

    // Pricing
    originalPrice: Number, // MRP/Original price
    buyingPrice: {
        type: Number,
        required: true
    },

    // Seller Details
    sellerName: {
        type: String,
        required: true
    },
    sellerPhone: {
        type: String,
        required: true
    },
    sellerAddress: String,

    // Verification Documents (Cloudinary URLs)
    idProofPhoto: String,
    panCardPhoto: String,
    productPhoto: String,

    // Ownership Tracking
    purchasedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['In Stock', 'Sold', 'Under Repair'],
        default: 'In Stock'
    },

    // Buyer Details (When Sold)
    soldTo: {
        customerName: String,
        customerPhone: String,
        saleDate: Date,
        salePrice: Number
    }
}, {
    timestamps: true
});

const SecondHandPurchase = mongoose.model('SecondHandPurchase', secondHandPurchaseSchema);

export default SecondHandPurchase;
