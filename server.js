require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { google } = require('googleapis');
const XLSX = require('xlsx');

const app = express();
app.use(express.json());
app.use(cors());

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth });
const FILE_ID = process.env.GOOGLE_DRIVE_FILE_ID;

if (!FILE_ID) {
    console.error("❌ ERROR: GOOGLE_DRIVE_FILE_ID is not set in .env file.");
    process.exit(1);
}

// Function to download Google Sheets as an Excel file
async function downloadExcel() {
    try {
        const dest = fs.createWriteStream('users.xlsx');

        const response = await drive.files.export(
            {
                fileId: FILE_ID,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
            { responseType: 'stream' }
        );

        return new Promise((resolve, reject) => {
            response.data
                .on('end', () => resolve('Downloaded'))
                .on('error', err => reject(err))
                .pipe(dest);
        });

    } catch (error) {
        console.error("❌ Error downloading file:", error.message);
        throw error;
    }
}

// Function to upload the modified Excel file
async function uploadExcel() {
    try {
        const media = {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: fs.createReadStream('users.xlsx'),
        };

        await drive.files.update({
            fileId: FILE_ID,
            media: media,
        });

        console.log("✅ Excel file uploaded successfully.");
    } catch (error) {
        console.error("❌ Error uploading file:", error.message);
        throw error;
    }
}

// Function to read users from the Excel file
function readUsers() {
    if (!fs.existsSync('users.xlsx')) return [];

    const workbook = XLSX.readFile('users.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
}

// Function to write users to the Excel file
function writeUsers(users) {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(users);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Users');
    XLSX.writeFile(workbook, 'users.xlsx');
}

// User Registration Route
app.post('/register', async (req, res) => {
    try {
        await downloadExcel();
        const { username, password } = req.body;
        let users = readUsers();

        if (users.some(user => user.username === username)) {
            return res.json({ message: 'Username already exists' });
        }

        users.push({ username, password });
        writeUsers(users);
        await uploadExcel();

        res.json({ message: 'Registration successful' });
    } catch (error) {
        res.status(500).json({ message: "Server error: " + error.message });
    }
});

// User Login Route
app.post('/login', async (req, res) => {
    try {
        await downloadExcel();
        const { username, password } = req.body;
        const users = readUsers();

        const user = users.find(user => user.username === username && user.password === password);
        if (!user) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }

        res.json({ success: true, message: 'Login successful' });
    } catch (error) {
        res.status(500).json({ message: "Server error: " + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
