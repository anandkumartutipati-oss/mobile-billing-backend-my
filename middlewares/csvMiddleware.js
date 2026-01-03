import multer from 'multer';

const storage = multer.memoryStorage();

const csvFilter = (req, file, cb) => {
    if (file.mimetype.includes('csv') || file.originalname.endsWith('.csv')) {
        cb(null, true);
    } else {
        cb(new Error('Please upload only CSV files.'), false);
    }
};

const uploadCSV = multer({
    storage: storage,
    fileFilter: csvFilter
});

export default uploadCSV;
