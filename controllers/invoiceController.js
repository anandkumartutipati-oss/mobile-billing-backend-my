import Invoice from '../models/Invoice.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import { getDiscountedPrice } from './offerController.js';

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Private
export const createInvoice = async (req, res) => {
    try {
        console.log("--- INVOICE CREATE (MERGED VERSION) ---");
        console.log("Creating invoice with body:", JSON.stringify(req.body, null, 2));

        const {
            items,
            discount = 0,
            discountType = 'Fixed', // 'Fixed' or 'Percentage'
            paymentMode,
            paymentMethod,
            paymentDetails,
            status,
            paidAmount = 0,
            mixedPayments = [], // [{ mode, amount }]
            emiDetails = {} // { rateOfInterest, tenureMonths, downPayment }
        } = req.body;

        // 1. Resolve Customer Fields
        let customerName = req.body.customerName;
        let customerMobile = req.body.customerMobile;

        if (req.body.customer) {
            customerName = customerName || req.body.customer.name;
            customerMobile = customerMobile || req.body.customer.mobile || req.body.customer.phone;
        }

        if (!customerName || !customerMobile) {
            console.error("SNAPSHOT ERROR: Missing name/mobile. Body:", req.body);
            return res.status(400).json({ message: 'Customer name and mobile/phone are required' });
        }

        console.log("SNAPSHOT DEBUG: customerName:", customerName, "customerMobile:", customerMobile);

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'No invoice items' });
        }

        // 1. Find or Create Customer
        let customer = await Customer.findOne({ mobile: customerMobile });
        if (!customer) {
            customer = await Customer.create({
                name: customerName,
                mobile: customerMobile,
                address: req.body.customer?.address || ''
            });
        }

        // 2. Calculate Totals and Update Stock
        let grossTotal = 0;
        const processedItemsRaw = [];

        for (const item of items) {
            let product = null;
            if (item.product && item.product !== 'undefined' && item.product !== 'null') {
                product = await Product.findById(item.product);
            }

            let unitPrice, itemLineTotal, itemGstPercent;

            if (product) {
                // --- EXISTING PRODUCT LOGIC ---
                unitPrice = item.price !== undefined ? Number(item.price) : product.sellingPrice;
                let itemDiscount = 0;

                if (item.price === undefined) {
                    const offerData = await getDiscountedPrice(product, product.sellingPrice, item.quantity);
                    unitPrice = offerData.price;
                    itemDiscount = offerData.discount;
                }

                itemGstPercent = item.gstPercent !== undefined ? Number(item.gstPercent) : (product.gstPercent || 18);
                // Validate GST percent (0-100)
                itemGstPercent = Math.max(0, Math.min(100, itemGstPercent || 0));

                // Validate quantity
                const itemQuantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
                if (itemQuantity !== Number(item.quantity)) {
                    return res.status(400).json({ message: `Invalid quantity for ${product.name}` });
                }

                // Strict Stock Validation
                if (product.stockQuantity < itemQuantity) {
                    return res.status(400).json({
                        message: `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Requested: ${itemQuantity}`
                    });
                }

                // IMEI Validation - Only for Mobiles & Tablets
                const cat = String(product.category || '').toLowerCase();
                const isMobileOrTablet = cat.includes('mobile') || cat.includes('tablet');

                if (product.trackIMEI && isMobileOrTablet) {
                    if (!item.imei || item.imei.length === 0) {
                        return res.status(400).json({ message: `IMEI numbers are required for ${product.name} (Category: ${product.category})` });
                    }
                    const requestImeis = (item.imei || []).map(i => String(i || '').trim()).filter(Boolean);
                    const stockImeis = (product.imei || []).map(i => String(i || '').trim()).filter(Boolean);

                    const missingIMEIs = requestImeis.filter(i => !stockImeis.includes(i));
                    if (missingIMEIs.length > 0) {
                        console.log(`Note: Manual/New IMEIs entered for ${product.name}:`, missingIMEIs);
                        // We allow manual entries as per user request, so we don't return 400 here.
                    }
                    item.imei = requestImeis; // Record all entered IMEIs in the invoice
                }

                itemLineTotal = unitPrice * itemQuantity; // This is now treated as INCLUSIVE

                processedItemsRaw.push({
                    product: product._id,
                    name: product.name,
                    category: product.category,
                    quantity: itemQuantity,
                    price: unitPrice, // Inclusive Price
                    originalPrice: product.sellingPrice,
                    purchasePrice: product.purchasePrice,
                    imei: product.trackIMEI ? item.imei : [],
                    simType: product.simType,
                    gstPercent: itemGstPercent,
                    discount: item.discount || 0,
                    itemLineTotal
                });

                // Update Stock
                const updatePayload = { $inc: { stockQuantity: -itemQuantity } };
                if (product.trackIMEI) {
                    console.log(`[STOCK DEBUG] Pulling IMEIs for ${product.name}:`, item.imei);
                    updatePayload.$pull = { imei: { $in: item.imei } };
                }

                console.log(`[STOCK DEBUG] Updating product ${item.product} with payload:`, JSON.stringify(updatePayload));
                const updatedProduct = await Product.findByIdAndUpdate(item.product, updatePayload, { new: true });
                console.log(`[STOCK DEBUG] New Stock for ${updatedProduct.name}: ${updatedProduct.stockQuantity}`);

            } else {
                // --- AD-HOC ITEM LOGIC (Second Hand / Manual) ---
                if (!item.name || item.price === undefined) {
                    return res.status(400).json({ message: 'Item requires either a valid product or a name and price' });
                }

                unitPrice = Math.max(0, Number(item.price) || 0);
                // Respect item's GST percent (often 0 for second hand)
                itemGstPercent = item.gstPercent !== undefined ? Number(item.gstPercent) : 18;
                itemGstPercent = Math.max(0, Math.min(100, itemGstPercent || 0));
                const itemQuantity = Math.max(1, Math.floor(Number(item.quantity) || 1));

                itemLineTotal = unitPrice * itemQuantity; // Treated as INCLUSIVE

                processedItemsRaw.push({
                    product: null,
                    name: item.name,
                    category: item.category || 'Others',
                    quantity: itemQuantity,
                    price: unitPrice,
                    originalPrice: unitPrice,
                    purchasePrice: Math.max(0, Number(item.purchasePrice) || 0),
                    imei: item.imei || [],
                    simType: item.simType || 'None',
                    gstPercent: itemGstPercent,
                    itemLineTotal
                });
                // No stock update for ad-hoc items
            }
            grossTotal += itemLineTotal;
        }

        // --- GLOBAL DISCOUNT & FINAL TOTALS ---
        let finalDiscount = Math.max(0, Number(discount) || 0);
        if (discountType === 'Percentage') {
            finalDiscount = (grossTotal * finalDiscount) / 100;
        }
        finalDiscount = Math.min(finalDiscount, grossTotal);

        // The Grand Total is simply Gross Total (Inclusive) minus Discount
        const grandTotal = Math.round(grossTotal - finalDiscount);

        // Redistribute net amount back to items to get accurate GST/Subtotal (matched frontend)
        let subTotal = 0;
        let gstTotal = 0;

        const processedItems = processedItemsRaw.map(item => {
            // itemShare is the portion of the final Grand Total allocated to this item
            const itemRatio = grossTotal > 0 ? (item.itemLineTotal / grossTotal) : 0;
            const itemShare = (grossTotal - finalDiscount) * itemRatio;

            const gstPercent = Math.max(0, Number(item.gstPercent) || 0);
            const gstDivisor = 1 + (gstPercent / 100);

            // Taxable = Inclusive / (1 + GST%)
            const itemTaxable = itemShare / gstDivisor;
            const itemGst = itemShare - itemTaxable;

            // Proportional discount for this item
            const itemDiscount = (finalDiscount * itemRatio);

            subTotal += itemTaxable;
            gstTotal += itemGst;

            return {
                ...item,
                gstPercent: gstPercent,
                gstAmount: Math.round(itemGst),
                discount: Math.round(itemDiscount),
                total: Math.round(itemShare)
            };
        });

        // Round final totals to whole numbers for consistent UI/Report display
        const roundedSubTotal = Math.round(subTotal);
        const roundedGstTotal = Math.round(gstTotal);
        const roundedDiscount = Math.round(finalDiscount);

        // --- PAYMENT LOGIC ---
        const activePaymentMode = paymentMode || paymentMethod || 'Cash';
        let finalEmiDetails = null;

        if (activePaymentMode === 'EMI' || activePaymentMode === 'Mixed') {
            // Only process if emiDetails is provided (Mixed mode might not include EMI)
            if (emiDetails && (emiDetails.monthlyInstallment || emiDetails.rateOfInterest !== undefined)) {
                if (emiDetails.monthlyInstallment) {
                    finalEmiDetails = {
                        rateOfInterest: emiDetails.rateOfInterest,
                        tenureMonths: emiDetails.tenureMonths,
                        downPayment: emiDetails.downPayment,
                        monthlyInstallment: Math.round(emiDetails.monthlyInstallment),
                        totalPaid: emiDetails.totalPaid,
                        nextDueDate: emiDetails.nextDueDate || new Date(new Date().setMonth(new Date().getMonth() + 1)),
                        installments: emiDetails.installments || []
                    };
                } else {
                    const rateOfInterest = Math.max(0, Number(emiDetails.rateOfInterest) || 0);
                    const interest = (grandTotal * rateOfInterest / 100);
                    const totalWithInterest = grandTotal + interest;
                    const tenure = Math.max(1, Math.floor(Number(emiDetails.tenureMonths) || 1));
                    const downPayment = Math.max(0, Math.min(grandTotal, Number(emiDetails.downPayment) || 0));
                    const monthlyInstallment = tenure > 0 ? (totalWithInterest - downPayment) / tenure : 0;

                    const dueDate = new Date();
                    dueDate.setMonth(dueDate.getMonth() + 1); // First EMI due after 1 month

                    finalEmiDetails = {
                        rateOfInterest: rateOfInterest,
                        tenureMonths: tenure,
                        downPayment: downPayment,
                        monthlyInstallment: Math.round(monthlyInstallment),
                        totalPaid: downPayment, // Initial payment is the down payment
                        nextDueDate: dueDate,
                        installments: [{
                            amount: downPayment,
                            paymentMode: activePaymentMode,
                            paymentDate: new Date(),
                            note: 'Down Payment'
                        }]
                    };
                }
            }
        }

        if (activePaymentMode === 'Mixed') {
            const totalMixed = (mixedPayments || []).reduce((acc, curr) => {
                if (!curr) return acc;
                return acc + Math.max(0, Number(curr.amount || 0));
            }, 0);
            if (Math.abs(totalMixed - paidAmount) > 1 && paidAmount !== 0) { // Allow 1 rupee tolerance for rounding
                console.warn("Mixed payment sum doesn't match paidAmount provided", { totalMixed, paidAmount });
            }
        }

        // 3. Generate Unique Invoice Number (Daily Sequential)
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const datePrefix = `INV-${todayStr}`;

        // Find the last invoice created today to get the next sequence number
        const lastInvoiceToday = await Invoice.findOne({
            invoiceNumber: new RegExp(`^${datePrefix}`)
        }).sort({ invoiceNumber: -1 });

        let nextNum = 1;
        if (lastInvoiceToday) {
            const parts = lastInvoiceToday.invoiceNumber.split('-');
            const lastSeq = parseInt(parts[parts.length - 1]);
            if (!isNaN(lastSeq)) {
                nextNum = lastSeq + 1;
            }
        }

        const invoiceNumber = `${datePrefix}-${nextNum.toString().padStart(3, '0')}`;

        const invoice = new Invoice({
            invoiceNumber,
            customer: customer._id,
            customerName,
            customerMobile,
            items: processedItems,
            subTotal: roundedSubTotal,
            discount: roundedDiscount,
            discountDetails: { type: discountType, value: discount },
            gstTotal: roundedGstTotal,
            grandTotal: grandTotal,
            paymentMode: activePaymentMode,
            paymentDetails,
            mixedPayments: activePaymentMode === 'Mixed' ? mixedPayments : [],
            emiDetails: finalEmiDetails,
            status: finalEmiDetails ? 'EMI - Active' : (status || 'Paid'),
            createdBy: req.user._id
        });

        const createdInvoice = await invoice.save();
        console.log("Invoice created successfully:", createdInvoice.invoiceNumber, "Snapshots:", { name: createdInvoice.customerName, mobile: createdInvoice.customerMobile });

        // 4. Update Customer History
        customer.purchaseHistory.push(createdInvoice._id);

        // Ensure numeric values for balance calculation
        const gTotal = Number(grandTotal) || 0;
        const pAmount = Number(paidAmount) || 0;
        const downPay = Number(emiDetails?.downPayment) || 0;

        if (createdInvoice.status !== 'Paid' && !['EMI - Active', 'EMI - Completed'].includes(createdInvoice.status)) {
            customer.outstandingBalance = (Number(customer.outstandingBalance) || 0) + (gTotal - pAmount);
        } else if (createdInvoice.status === 'EMI - Active') {
            customer.outstandingBalance = (Number(customer.outstandingBalance) || 0) + (gTotal - downPay);
        }
        await customer.save();

        res.status(201).json(createdInvoice);
    } catch (err) {
        console.error("Error in createInvoice:", err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
export const getInvoices = async (req, res) => {
    try {
        const invoices = await Invoice.find({}).populate('customer', 'name mobile').sort({ createdAt: -1 });
        res.json(invoices);
    } catch (error) {
        console.error("Error fetching invoices:", error);
        res.status(500).json({ message: 'Error fetching invoices', error: error.message });
    }
};

// @desc    Get invoice by ID
// @route   GET /api/invoices/:id
// @access  Private
export const getInvoiceById = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('customer')
            .populate('createdBy', 'name');

        if (invoice) {
            res.json(invoice);
        } else {
            res.status(404).json({ message: 'Invoice not found' });
        }
    } catch (error) {
        console.error("Error fetching invoice:", error);
        res.status(500).json({ message: 'Error fetching invoice', error: error.message });
    }
};

// @desc    Get Dashboard Stats
// @route   GET /api/invoices/stats
// @access  Private
export const getDashboardStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        // Better Profit Calculation (Item by Item)
        // Exclude Cancelled invoices to match report logic
        const invoices = await Invoice.find({
            createdAt: { $gte: firstDayOfMonth },
            status: { $ne: 'Cancelled' }
        });

        let todaySales = 0;
        let todayCount = 0;
        let todayProfit = 0;
        let monthSales = 0;
        let monthProfit = 0;

        // Payment Mode Breakdown (For Monthly Sales)
        const paymentModes = {
            Cash: 0,
            UPI: 0,
            Card: 0,
            EMI: 0
        };

        (invoices || []).forEach(inv => {
            if (!inv) return;

            const grandTotal = Math.max(0, Number(inv.grandTotal || 0));
            monthSales += grandTotal;

            // Aggregate Payment Modes
            if (inv.paymentMode === 'Mixed') {
                (inv.mixedPayments || []).forEach(p => {
                    if (paymentModes[p.mode] !== undefined) {
                        paymentModes[p.mode] += Number(p.amount) || 0;
                    }
                });
                // If there's an EMI portion in a mixed payment
                if (inv.emiDetails) {
                    const downPayment = Number(inv.emiDetails.downPayment) || 0;
                    const totalPayable = grandTotal; // For simplicity in pie chart, we use principal
                    const emiPortion = grandTotal - downPayment;
                    paymentModes.EMI += Math.max(0, emiPortion);
                }
            } else if (inv.paymentMode === 'EMI') {
                const downPayment = Number(inv.emiDetails?.downPayment) || 0;
                paymentModes.Cash += downPayment; // Assuming downpayment is cash if not mixed
                paymentModes.EMI += Math.max(0, grandTotal - downPayment);
            } else if (paymentModes[inv.paymentMode] !== undefined) {
                paymentModes[inv.paymentMode] += grandTotal;
            }

            let invCost = 0;
            (inv.items || []).forEach(item => {
                if (item) {
                    invCost += Math.max(0, Number(item.purchasePrice || 0)) * Math.max(0, Number(item.quantity || 0));
                }
            });

            const subTotal = Math.max(0, Number(inv.subTotal || 0));
            const discount = Math.max(0, Number(inv.discount || 0));
            const invProfit = Math.max(0, (subTotal - invCost) - discount);
            monthProfit += invProfit;

            if (inv.createdAt && new Date(inv.createdAt) >= today) {
                todaySales += grandTotal;
                todayCount += 1;
                todayProfit += invProfit;
            }
        });

        // Stock Value & Category Counts
        const products = await Product.find({});
        let totalStockValue = 0;
        let lowStockAlerts = 0;
        const categoryCounts = {};

        (products || []).forEach(p => {
            if (!p) return;
            const purchasePrice = Math.max(0, Number(p.purchasePrice || 0));
            const stockQuantity = Math.max(0, Number(p.stockQuantity || 0));
            const lowStockThreshold = Math.max(0, Number(p.lowStockThreshold || 0));

            totalStockValue += (purchasePrice * stockQuantity);
            if (stockQuantity <= lowStockThreshold) {
                lowStockAlerts++;
            }

            // Categorization
            const cat = (p.category || 'Others').trim();
            const normalizedCat = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();

            if (!categoryCounts[normalizedCat]) {
                categoryCounts[normalizedCat] = 0;
            }
            categoryCounts[normalizedCat] += stockQuantity;
        });

        res.json({
            todaySales,
            todayCount,
            todayProfit,
            monthSales,
            monthProfit,
            totalStockValue,
            lowStockAlerts,
            paymentModes,
            categoryCounts
        });
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Pay EMI installment
// @route   POST /api/invoices/:id/pay-emi
// @access  Private
export const payEmi = async (req, res) => {
    try {
        const { amount, paymentMode, note } = req.body;
        const invoice = await Invoice.findById(req.params.id);

        if (!invoice || (!invoice.emiDetails)) {
            return res.status(404).json({ message: 'EMI details not found for this invoice' });
        }

        // Add installment
        invoice.emiDetails.installments.push({
            amount,
            paymentMode,
            note,
            paymentDate: new Date()
        });

        // Update totals
        invoice.emiDetails.totalPaid = Math.round(invoice.emiDetails.totalPaid + Number(amount));

        // Calculate new due date
        const nextDate = new Date(invoice.emiDetails.nextDueDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        invoice.emiDetails.nextDueDate = nextDate;

        // Check if fully paid (Total Interest + GrandTotal)
        const interest = (invoice.grandTotal * (invoice.emiDetails.rateOfInterest || 0) / 100);
        const totalPayable = invoice.grandTotal + interest;

        if (invoice.emiDetails.totalPaid >= totalPayable) {
            invoice.status = 'EMI - Completed';
        }

        const updatedInvoice = await invoice.save();

        // Update customer outstanding
        const customer = await Customer.findById(invoice.customer);
        if (customer) {
            const payAmount = Number(amount) || 0;
            customer.outstandingBalance = Math.max(0, (Number(customer.outstandingBalance) || 0) - payAmount);
            await customer.save();
        }

        res.json(updatedInvoice);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all EMI active invoices
// @route   GET /api/invoices/emi-list
// @access  Private
export const getEmiInvoices = async (req, res) => {
    try {
        const invoices = await Invoice.find({ status: 'EMI - Active' })
            .populate('customer', 'name mobile address')
            .sort({ 'emiDetails.nextDueDate': 1 });

        // Format for a detailed table
        const formattedList = (invoices || []).map(inv => {
            if (!inv) return null;

            const grandTotal = Math.max(0, Number(inv.grandTotal || 0));
            const rateOfInterest = Math.max(0, Number(inv.emiDetails?.rateOfInterest || 0));
            const totalPaid = Math.max(0, Number(inv.emiDetails?.totalPaid || 0));

            const interest = (grandTotal * rateOfInterest / 100);
            const totalPayable = grandTotal + interest;
            const remaining = Math.max(0, totalPayable - totalPaid);

            // Accurate months paid count (excluding Down Payment note)
            const installments = inv.emiDetails?.installments || [];
            const paidMonths = installments.filter(inst => inst && inst.note !== 'Down Payment').length;

            return {
                id: inv._id,
                invoiceNo: inv.invoiceNumber || 'N/A',
                customer: inv.customer?.name || inv.customerName || 'N/A',
                mobile: inv.customer?.mobile || inv.customerMobile || 'N/A',
                product: (inv.items || []).map(i => i?.name || '').filter(Boolean).join(', ') || 'N/A',
                itemDetails: (inv.items || []).map(i => {
                    if (!i) return null;
                    return {
                        name: i.name || '',
                        qty: Math.max(0, Number(i.quantity || 0)),
                        billPrice: Math.max(0, Number(i.price || 0)),
                        mrp: Math.max(0, Number(i.originalPrice || 0))
                    };
                }).filter(Boolean),
                totalValue: Math.round(totalPayable),
                paid: totalPaid,
                remaining: Math.round(remaining),
                monthlyEMI: Math.max(0, Number(inv.emiDetails?.monthlyInstallment || 0)),
                nextDue: inv.emiDetails?.nextDueDate ? new Date(inv.emiDetails.nextDueDate).toISOString().split('T')[0] : 'N/A',
                monthsPaid: paidMonths,
                monthsRemaining: Math.max(0, (Math.max(0, Number(inv.emiDetails?.tenureMonths || 0)) - paidMonths)),
                emiProgress: `${paidMonths}/${Math.max(0, Number(inv.emiDetails?.tenureMonths || 0))}`
            };
        }).filter(Boolean);

        res.json(formattedList);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
