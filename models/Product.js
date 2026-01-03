import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    images: {
        type: [String],
        default: []
    },
    brand: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: [
            'Mobile Phones',
            'Tablets',
            'Chargers',
            'Earphones',
            'Cables',
            'Power Banks',
            'Screen Guards',
            'Back Covers',
            'Accessories',
            'Smart Watches',
            'Bluetooth Speakers',
            'Memory Cards',
            'Wireless Earbuds',
            'Car Accessories',
            'Others'
        ],
        default: 'Mobile Phones'
    },
    imei: {
        type: [String], // Support for single/dual IMEI
        default: []
    },
    trackIMEI: {
        type: Boolean,
        default: true
    },
    simType: {
        type: String,
        enum: ['Single SIM', 'Dual SIM', 'None'],
        default: 'None'
    },
    purchasePrice: {
        type: Number,
        required: true
    },
    sellingPrice: {
        type: Number,
        required: true
    },
    gstPercent: {
        type: Number,
        default: 18
    },
    stockQuantity: {
        type: Number,
        default: 0
    },
    lowStockThreshold: {
        type: Number,
        default: 2
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier'
    },
    warrantyPeriod: String, // e.g., "1 Year"
    purchaseDate: Date,
    description: String
}, {
    timestamps: true
});

const Product = mongoose.model('Product', productSchema);

export default Product;
