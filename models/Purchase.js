import mongoose from 'mongoose';

const purchaseSchema = new mongoose.Schema({
    purchaseNumber: {
        type: String,
        required: true,
        unique: true
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
        required: true
    },
    supplierInvoiceNumber: {
        type: String,
        required: true,
        trim: true
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        name: String,
        category: String,
        brand: String,
        sellingPrice: Number,
        simType: { type: String, enum: ['Single SIM', 'Dual SIM', 'None'], default: 'None' },
        gstPercent: { type: Number, default: 18 },
        quantity: {
            type: Number,
            required: true
        },
        purchasePrice: {
            type: Number,
            required: true
        },
        imeis: [String], // List of IMEIs added in this purchase
        description: String,
        images: [String],
        warrantyPeriod: String,
        lowStockThreshold: Number
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['Paid', 'Partial', 'Pending'],
        default: 'Pending'
    },
    purchaseDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const Purchase = mongoose.model('Purchase', purchaseSchema);

export default Purchase;
