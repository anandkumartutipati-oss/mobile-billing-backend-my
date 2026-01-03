import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    phone: String,
    gstNumber: String,
    address: String,
    purchaseRecords: [{
        invoiceNo: String,
        date: Date,
        amount: Number,
        attachment: String // URL to uploaded purchase invoice
    }]
}, {
    timestamps: true
});

const Supplier = mongoose.model('Supplier', supplierSchema);

export default Supplier;
