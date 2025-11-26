const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

async function authorize() {
    try {
        // Đọc credentials
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
        
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        
        // Kiểm tra xem đã có token chưa
        if (fs.existsSync(TOKEN_PATH)) {
            const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
            oAuth2Client.setCredentials(token);
            console.log('✅ Đã có token hợp lệ!');
            return oAuth2Client;
        }
        
        // Nếu chưa có token, tạo URL authorize
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        
        console.log('🔗 Truy cập URL này để authorize Google Drive API:');
        console.log(authUrl);
        console.log('\n📝 Sau khi authorize, copy code từ URL và paste vào đây:');
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question('Enter the code from that page here: ', async (code) => {
            try {
                const { tokens } = await oAuth2Client.getToken(code);
                oAuth2Client.setCredentials(tokens);
                
                // Lưu token vào file
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
                console.log('✅ Token đã được lưu vào token.json');
                console.log('🎉 Authorization thành công! Bây giờ bạn có thể sử dụng Google Drive API.');
                
                rl.close();
            } catch (error) {
                console.error('❌ Lỗi khi lấy token:', error.message);
                rl.close();
            }
        });
        
    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        console.log('\n📋 Hãy đảm bảo:');
        console.log('1. File credentials.json đã được đặt trong thư mục gốc');
        console.log('2. Google Drive API đã được enable trong Google Cloud Console');
        console.log('3. OAuth consent screen đã được cấu hình');
    }
}

// Chạy authorize
authorize(); 