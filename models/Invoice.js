import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        required: true,
        unique: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    customerName: String,
    customerMobile: String,
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product'
        },
        name: String,
        category: String,
        imei: [String],
        simType: String,
        quantity: Number,
        price: Number, // Selling price after discount
        originalPrice: Number, // Base selling price before discount
        purchasePrice: Number, // Cost price at time of sale
        gstPercent: Number,
        gstAmount: Number,
        discount: Number,
        total: Number
    }],
    subTotal: Number,
    discount: {
        type: Number,
        default: 0
    },
    discountDetails: {
        type: { type: String, enum: ['Percentage', 'Fixed'] },
        value: Number
    },
    gstTotal: Number,
    grandTotal: {
        type: Number,
        required: true
    },
    paymentMode: {
        type: String,
        enum: ['Cash', 'UPI', 'Card', 'Mixed', 'EMI'],
        default: 'Cash'
    },
    paymentDetails: String,
    mixedPayments: [{
        mode: { type: String, enum: ['Cash', 'UPI', 'Card'] },
        amount: Number
    }],
    emiDetails: {
        rateOfInterest: Number,
        tenureMonths: Number,
        downPayment: Number,
        monthlyInstallment: Number,
        totalPaid: { type: Number, default: 0 },
        nextDueDate: Date,
        installments: [{
            amount: Number,
            paymentMode: String,
            paymentDate: { type: Date, default: Date.now },
            note: String
        }]
    },
    status: {
        type: String,
        enum: ['Paid', 'Partial', 'Pending', 'Cancelled', 'EMI - Active', 'EMI - Completed'],
        default: 'Paid'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
