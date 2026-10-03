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

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'processed');
const LOCAL_POPPLER_BIN = path.join(__dirname, '..', 'poppler', 'Library', 'bin');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

// Static server phục vụ ảnh đã cắt
app.use('/processed', express.static(PROCESSED_DIR));

const upload = multer({ dest: UPLOADS_DIR });

// 1. API: LẤY DANH SÁCH TẤT CẢ CUỐN SÁCH ĐÃ CÓ TRONG PROCESSED
app.get('/api/books', (req, res) => {
  try {
    const folders = fs.readdirSync(PROCESSED_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    const books = [];

    folders.forEach(folderId => {
      const folderPath = path.join(PROCESSED_DIR, folderId);
      const metaPath = path.join(folderPath, 'meta.json');
      
      const files = fs.readdirSync(folderPath)
        .filter(f => f.startsWith('page-') && f.endsWith('.jpg'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)[0]);
          const numB = parseInt(b.match(/\d+/)[0]);
          return numA - numB;
        });

      if (files.length > 0) {
        let meta = {
          bookId: folderId,
          bookName: `Sách ${folderId.substring(0, 8)}`,
          totalPages: files.length,
          coverUrl: `http://localhost:${PORT}/processed/${folderId}/${files[0]}`
        };

        if (fs.existsSync(metaPath)) {
          try {
            const rawMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            meta = { ...meta, ...rawMeta };
          } catch (e) {}
        }

        books.push(meta);
      }
    });

    return res.json({ success: true, books });
  } catch (err) {
    console.error('Lỗi lấy danh sách sách:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. API: LẤY CHI TIẾT CÁC TRANG CỦA 1 CUỐN SÁCH CỤ THỂ (LOAD NGAY)
app.get('/api/books/:bookId', (req, res) => {
  try {
    const { bookId } = req.params;
    const outputDir = path.join(PROCESSED_DIR, bookId);

    if (!fs.existsSync(outputDir)) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy cuốn sách này!' });
    }

    const files = fs.readdirSync(outputDir)
      .filter(f => f.startsWith('page-') && f.endsWith('.jpg'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)[0]);
        const numB = parseInt(b.match(/\d+/)[0]);
        return numA - numB;
      });

    if (files.length === 0) {
      return res.status(400).json({ success: false, error: 'Cuốn sách chưa có trang nào được render!' });
    }

    const pages = files.map((file, index) => ({
      pageNumber: index + 1,
      imageUrl: `http://localhost:${PORT}/processed/${bookId}/${file}`
    }));

    return res.json({
      success: true,
      fileId: bookId,
      totalPages: pages.length,
      pages
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. API: UPLOAD FILE MỚI (NẾU ĐÃ LOAD RỒI THÌ BÁO CACHE HIT)
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Vui lòng gửi file PDF lên!' });
    }

    const tempPdfPath = req.file.path;
    const originalName = req.file.originalname || 'Tài liệu PDF';

    // Tính MD5 Hash theo nội dung file
    const fileBuffer = fs.readFileSync(tempPdfPath);
    const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const outputDir = path.join(PROCESSED_DIR, fileHash);

    // Kiểm tra nếu đã được xử lý từ trước
    if (fs.existsSync(outputDir)) {
      const existingFiles = fs.readdirSync(outputDir)
        .filter(f => f.startsWith('page-') && f.endsWith('.jpg'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)[0]);
          const numB = parseInt(b.match(/\d+/)[0]);
          return numA - numB;
        });

      if (existingFiles.length > 0) {
        fs.unlinkSync(tempPdfPath);

        const pages = existingFiles.map((file, index) => ({
          pageNumber: index + 1,
          imageUrl: `http://localhost:${PORT}/processed/${fileHash}/${file}`
        }));

        console.log(`⚡ [CACHE HIT] Dùng lại dữ liệu: ${fileHash}`);

        return res.json({
          success: true,
          fromCache: true,
          fileId: fileHash,
          totalPages: pages.length,
          pages
        });
      }
    }

    // Nếu chưa có -> Tạo mới và cắt ảnh
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
    fs.unlinkSync(tempPdfPath);

    const files = fs.readdirSync(outputDir)
      .filter(f => f.startsWith('page-') && f.endsWith('.jpg'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)[0]);
        const numB = parseInt(b.match(/\d+/)[0]);
        return numA - numB;
      });

    // Lưu metadata sách
    const metaData = {
      bookId: fileHash,
      bookName: originalName.replace(/\.[^/.]+$/, ''),
      totalPages: files.length,
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(outputDir, 'meta.json'), JSON.stringify(metaData, null, 2));

    const pages = files.map((file, index) => ({
      pageNumber: index + 1,
      imageUrl: `http://localhost:${PORT}/processed/${fileHash}/${file}`
    }));

    return res.json({
      success: true,
      fromCache: false,
      fileId: fileHash,
      totalPages: pages.length,
      pages
    });

  } catch (processErr) {
    console.error('Lỗi chuyển đổi PDF:', processErr);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ success: false, error: 'Lỗi trong quá trình xử lý PDF!' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend Server đang chạy tại http://localhost:${PORT}`);
});