import Supplier from '../models/Supplier.js';

// @desc    Get all suppliers
// @route   GET /api/suppliers
// @access  Private
export const getSuppliers = async (req, res) => {
    try {
        const suppliers = await Supplier.find({});
        res.json(suppliers);
    } catch (error) {
        console.error("Error fetching suppliers:", error);
        res.status(500).json({ message: 'Error fetching suppliers', error: error.message });
    }
};

// @desc    Create a supplier
// @route   POST /api/suppliers
// @access  Private/Owner
export const createSupplier = async (req, res) => {
    try {
        const { name, phone, gstNumber, address } = req.body;

        // Validation
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Supplier name is required' });
        }

        if (!phone || !phone.trim()) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        // Validate GST number format if provided (15 alphanumeric characters)
        if (gstNumber && gstNumber.trim()) {
            const gstinRegex = /^[0-9A-Z]{15}$/;
            if (!gstinRegex.test(gstNumber.trim().toUpperCase())) {
                return res.status(400).json({ message: 'GSTIN must be 15 alphanumeric characters' });
            }
        }

        const supplier = await Supplier.create({
            name: name.trim(),
            phone: phone.trim(),
            gstNumber: gstNumber ? gstNumber.trim().toUpperCase() : '',
            address: address ? address.trim() : ''
        });
        res.status(201).json(supplier);
    } catch (err) {
        console.error("Error in createSupplier:", err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update a supplier
// @route   PUT /api/suppliers/:id
// @access  Private/Owner
export const updateSupplier = async (req, res) => {
    try {
        const supplier = await Supplier.findById(req.params.id);

        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        if (req.body.name !== undefined) {
            if (!req.body.name || !req.body.name.trim()) {
                return res.status(400).json({ message: 'Supplier name cannot be empty' });
            }
            supplier.name = req.body.name.trim();
        }

        if (req.body.phone !== undefined) {
            if (!req.body.phone || !req.body.phone.trim()) {
                return res.status(400).json({ message: 'Phone number cannot be empty' });
            }
            supplier.phone = req.body.phone.trim();
        }

        if (req.body.gstNumber !== undefined) {
            if (req.body.gstNumber && req.body.gstNumber.trim()) {
                const gstinRegex = /^[0-9A-Z]{15}$/;
                if (!gstinRegex.test(req.body.gstNumber.trim().toUpperCase())) {
                    return res.status(400).json({ message: 'GSTIN must be 15 alphanumeric characters' });
                }
                supplier.gstNumber = req.body.gstNumber.trim().toUpperCase();
            } else {
                supplier.gstNumber = '';
            }
        }

        if (req.body.address !== undefined) {
            supplier.address = req.body.address ? req.body.address.trim() : '';
        }

        if (req.body.purchaseRecords !== undefined) {
            supplier.purchaseRecords = req.body.purchaseRecords || supplier.purchaseRecords;
        }

        const updatedSupplier = await supplier.save();
        res.json(updatedSupplier);
    } catch (error) {
        console.error("Error updating supplier:", error);
        res.status(400).json({ message: 'Error updating supplier', error: error.message });
    }
};
