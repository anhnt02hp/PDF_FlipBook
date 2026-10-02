const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pdfPoppler = require('pdf-poppler');
const crypto = require('crypto');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Thư mục lưu trữ
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'processed');

// Đường dẫn trỏ trực tiếp tới Poppler bin (nếu có trong dự án)
const LOCAL_POPPLER_BIN = path.join(__dirname, '..', 'poppler', 'Library', 'bin');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

// Static server phục vụ ảnh đã cắt
app.use('/processed', express.static(PROCESSED_DIR));

// Cấu hình Multer upload file tạm
const upload = multer({ dest: UPLOADS_DIR });

// API UPLOAD & CHUYỂN ĐỔI PDF
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Vui lòng gửi file PDF lên!' });
    }

    const tempPdfPath = req.file.path;

    // 1. Tính MD5 Hash nội dung file PDF để tạo ID duy nhất
    const fileBuffer = fs.readFileSync(tempPdfPath);
    const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const outputDir = path.join(PROCESSED_DIR, fileHash);

    // 2. KIỂM TRA CACHE: Nếu folder chứa các trang cắt sẵn đã tồn tại
    if (fs.existsSync(outputDir)) {
      const existingFiles = fs.readdirSync(outputDir)
        .filter(f => f.startsWith('page-') && f.endsWith('.jpg'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)[0]);
          const numB = parseInt(b.match(/\d+/)[0]);
          return numA - numB;
        });

      if (existingFiles.length > 0) {
        // Đã cắt sẵn từ trước => Xóa file upload tạm & Trả kết quả ngay lập tức
        fs.unlinkSync(tempPdfPath);

        const pages = existingFiles.map((file, index) => ({
          pageNumber: index + 1,
          imageUrl: `http://localhost:${PORT}/processed/${fileHash}/${file}`
        }));

        console.log(`⚡ [CACHE HIT] Dùng lại dữ liệu đã xử lý từ: processed/${fileHash}`);

        return res.json({
          success: true,
          fromCache: true,
          message: 'Lấy dữ liệu từ cache thành công!',
          fileId: fileHash,
          totalPages: pages.length,
          pages
        });
      }
    }

    // 3. NẾU CHƯA CÓ CACHE => Tiến hành tạo folder & cắt ảnh bằng Poppler
    fs.mkdirSync(outputDir, { recursive: true });

    const options = {
      format: 'jpeg',
      out_dir: outputDir,
      out_prefix: 'page',
      page: null,
      scale: 1200
    };

    if (fs.existsSync(LOCAL_POPPLER_BIN)) {
      options.bin_dir = LOCAL_POPPLER_BIN;
    }

    await pdfPoppler.convert(tempPdfPath, options);

    // Xóa file upload tạm trong thư mục /uploads
    fs.unlinkSync(tempPdfPath);

    // Đọc danh sách ảnh vừa cắt
    const files = fs.readdirSync(outputDir)
      .filter(f => f.startsWith('page-') && f.endsWith('.jpg'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)[0]);
        const numB = parseInt(b.match(/\d+/)[0]);
        return numA - numB;
      });

    const totalPages = files.length;
    const pages = files.map((file, index) => ({
      pageNumber: index + 1,
      imageUrl: `http://localhost:${PORT}/processed/${fileHash}/${file}`
    }));

    console.log(`✨ [NEW CONVERT] Đã chuyển đổi thành công PDF sang: processed/${fileHash}`);

    return res.json({
      success: true,
      fromCache: false,
      message: 'Xử lý PDF thành công!',
      fileId: fileHash,
      totalPages,
      pages
    });

  } catch (processErr) {
    console.error('Lỗi chuyển đổi PDF:', processErr);
    
    // Dọn dẹp file tạm nếu xảy ra lỗi
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    return res.status(500).json({ 
      success: false, 
      error: 'Đã xảy ra lỗi trong quá trình xử lý file PDF!' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend Server đang chạy tại http://localhost:${PORT}`);
});