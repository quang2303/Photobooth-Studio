const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const exec = require('child_process').exec;

const PORT = 8585;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  if (!clientId || !clientSecret || clientId === 'your-client-id-here') {
    console.error('\n❌ LỖI: Bạn chưa điền GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET vào file .env!');
    console.error('Hãy mở file "App server/.env" và điền thông tin trước khi chạy lại script này.\n');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Bắt buộc để nhận Refresh Token
    prompt: 'consent',     // Bắt buộc hiển thị bảng hỏi quyền để lấy Refresh Token mới
    scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
  });

  console.log('\n======================================================');
  console.log('👉 HÃY MỞ ĐƯỜNG LINK DƯỚI ĐÂY TRÊN TRÌNH DUYỆT ĐỂ CẤP QUYỀN:');
  console.log(authUrl);
  console.log('======================================================\n');
  console.log('Đang chờ bạn cấp quyền trên trình duyệt...');

  // Mở trình duyệt tự động
  try {
    const cmd = process.platform === 'win32' ? `start "" "${authUrl}"` : (process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`);
    exec(cmd);
  } catch (e) {
    // Không làm gì nếu không tự mở được trình duyệt
  }

  // Khởi tạo máy chủ HTTP tạm thời để hứng Authorization Code từ Google gửi về
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/oauth2callback')) {
        const query = url.parse(req.url, true).query;
        const code = query.code;

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h3>Cấp quyền thành công! Bạn hãy quay lại màn hình Terminal/VS Code để lấy Refresh Token.</h3>');

          // Đổi Authorization Code lấy Tokens
          const { tokens } = await oauth2Client.getToken(code);
          console.log('\n======================================================');
          console.log('✅ LẤY REFRESH TOKEN THÀNH CÔNG!');
          console.log('Hãy copy dòng bên dưới dán thêm vào cuối file .env:');
          console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
          console.log('======================================================\n');
          
          server.close(() => {
            process.exit(0);
          });
        } else {
          res.writeHead(400);
          res.end('Thieu authorization code.');
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (err) {
      console.error('Lỗi khi lấy token:', err.message);
      res.writeHead(500);
      res.end('Lỗi máy chủ');
    }
  });

  server.listen(PORT);
}

// Load cấu hình env
require('dotenv').config();
main();
