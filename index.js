const http = require('http');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const path = require('path');
const moment = require('moment');
const cors = require('cors');
const bodyParser = require('body-parser');

// Initialize Express app
const app = express();
app.use(express.json());

// Add CORS middleware to allow all origins
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

// State variable
let btnState = 0;

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDate = moment().format('YYYY-MM-DD');
        const uploadDir = path.join(__dirname, 'Uploads', uploadDate);
        console.log('Creating directory:', uploadDir);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
            file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files are allowed!'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Main JSON file path
const mainJsonPath = path.join(__dirname, 'main_attendance_record.json');

// Initialize main JSON file if it doesn't exist
function initializeMainJson() {
    if (!fs.existsSync(mainJsonPath)) {
        console.log('Creating new main JSON file:', mainJsonPath);
        const initialData = { records: [] };
        fs.writeFileSync(mainJsonPath, JSON.stringify(initialData, null, 2), 'utf8');
        console.log('Main JSON file created successfully');
    }
}

    let faculty_name = null
    let venue_name  = null
    let class_name  = null
  

// API 1: Toggle state variable
app.post('/startsession', (req, res) => {
    try {
        const data = req.body;
        console.log('Received data:', data);
        faculty_name = data.faculty_name;
        venue_name = data.venue_name;
        class_name = data.subject_code;
        btnState=4;
        console.log('Button state toggled to:', btnState);
        res.status(200)
    } catch (error) {
        console.error('Toggle state error:', error);
        res.status(500)
    }
});

// API 2: Get state variable
app.get('/getbtnstate', (req, res) => {
    try {
        res.json({ state: btnState });
    } catch (error) {
        console.error('Get state error:', error);
        res.status(500).json({ error: 'Server error while fetching state' });
    }
});

// API 3: Upload Excel file
app.post('/upload', upload.single('attendance'), async (req, res) => {
    try {
        console.log('Received upload request:', req.file);
        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const currentDate = moment().format('YYYY-MM-DD');
        const receivedAt = moment().format('YYYY-MM-DD HH:mm:ss');
        const time = moment().format('HH:mm:ss');

        
        // Generate relative path for the file
        const relativePath = path.join('Uploads', currentDate, req.file.filename).replace(/\\/g, '/');
        console.log('Generated relative path:', relativePath);

        // Initialize JSON file if it doesn't exist
        console.log('Checking main JSON file:', mainJsonPath);
        initializeMainJson();

        // Read main JSON file
        console.log('Reading main JSON file');
        let jsonData;
        try {
            jsonData = JSON.parse(fs.readFileSync(mainJsonPath, 'utf8'));
        } catch (err) {
            console.error('Error reading main JSON file:', err);
            throw new Error('Failed to read main JSON file');
        }

        // Add new record
        const newRecord = {
            faculty_name: faculty_name,
            venue_name: venue_name,
            class_name:class_name,
            date: currentDate,
            time:time,
            fileLocation: relativePath,
            receivedAt: receivedAt
        };
        console.log('Adding new record:', newRecord);
        jsonData.records.push(newRecord);
        console.log('New record count:', jsonData.records.length);

        // Save the updated JSON file
        console.log('Saving main JSON file');
        try {
            fs.writeFileSync(mainJsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
            console.log('Main JSON file saved successfully');
        } catch (err) {
            console.error('Error writing main JSON file:', err);
            throw new Error('Failed to write main JSON file');
        }

        // Verify file modification
        const afterStats = fs.statSync(mainJsonPath);
        console.log('After modification stats:', afterStats.mtime);
        btnState=0;
        console.log('Button state reset to:', btnState);
        faculty_name= null
        venue_name= null
        class_name=null
        res.json({
            message: 'File uploaded successfully',
            filePath: relativePath
        });
    } catch (error) {
        console.error('Detailed upload error:', error);
        res.status(500).json({ error: 'Server error while processing upload', details: error.message });
    }
});

// API 4: Fetch most recent Excel file
app.get('/fetch-latest', async (req, res) => {
    try {
        console.log('Attempting to read main JSON file:', mainJsonPath);
        if (!fs.existsSync(mainJsonPath)) {
            console.log('Main JSON file does not exist');
            return res.status(404).json({ error: 'Main attendance record not found' });
        }

        // Read main JSON file
        let jsonData;
        try {
            jsonData = JSON.parse(fs.readFileSync(mainJsonPath, 'utf8'));
        } catch (err) {
            console.error('Error reading main JSON file:', err);
            throw new Error('Failed to read main JSON file');
        }

        console.log('Records found, count:', jsonData.records.length);
        if (!jsonData.records || jsonData.records.length === 0) {
            console.log('No records in JSON file');
            return res.status(404).json({ error: 'No attendance records found' });
        }

        // Get the latest record
        const lastRecord = jsonData.records[jsonData.records.length - 1];
        const fileLocation = lastRecord.fileLocation;
        console.log('File location from last record:', fileLocation);
        if (!fileLocation) {
            console.log('File location is empty');
            return res.status(404).json({ error: 'File location not specified in record' });
        }

        const absolutePath = path.join(__dirname, fileLocation);
        console.log('Absolute path:', absolutePath);
        if (!fs.existsSync(absolutePath)) {
            console.log('File does not exist at:', absolutePath);
            return res.status(404).json({ error: 'File not found on server' });
        }

        // Send the file
        console.log('Sending file:', absolutePath);
        res.download(absolutePath, `attendance-${moment().format('YYYY-MM-DD')}.xlsx`);
    } catch (error) {
        console.error('Detailed fetch-latest error:', error);
        res.status(500).json({ error: 'Server error while fetching file', details: error.message });
    }
});

// API 5: Fetch main JSON file
app.get('/fetch-main', async (req, res) => {
    try {
        if (!fs.existsSync(mainJsonPath)) {
            console.log('Main JSON file does not exist');
            return res.status(404).json({ error: 'Main attendance record not found' });
        }

        res.download(mainJsonPath, 'main_attendance_record.json');
    } catch (error) {
        console.error('Fetch main error:', error);
        res.status(500).json({ error: 'Server error while fetching main record', details: error.message });
    }
});
// fetch by location
// API 6: Fetch file by fileLocation
let downloadInProgress = false;
app.get('/fetch-by-location', async (req, res) => {
    if (downloadInProgress) {
        console.log('Download already in progress.');
        return res.status(429).json({ error: 'Download already in progress. Try again later.' });
    }
    downloadInProgress = true;
    try {
        const fileLocation = req.query.fileLocation;
        console.log('Received file location:', fileLocation);
        if (!fileLocation) {
            console.log('File location not provided');
            return res.status(400).json({ error: 'File location not provided' });
        }

        const absolutePath = path.join(__dirname, fileLocation);
        console.log('Absolute path:', absolutePath);
        if (!fs.existsSync(absolutePath)) {
            console.log('File does not exist at:', absolutePath);
            return res.status(404).json({ error: 'File not found on server' });
        }

        // Send the file
        console.log('Sending file:', absolutePath);
        res.download(absolutePath, `attendance-${moment().format('YYYY-MM-DD')}.xlsx`, () => {
            downloadInProgress = false; // reset after done
        });
    } catch (error) {
        downloadInProgress = false;
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});



// Initialize server
async function startServer() {
    try {
        initializeMainJson();
        
        const server = http.createServer(app);
        
        server.listen(6601, () => {
            console.log('HTTP Server running on port 6601');
        });
    } catch (error) {
        console.error('Server startup error:', error);
    }
}

startServer();