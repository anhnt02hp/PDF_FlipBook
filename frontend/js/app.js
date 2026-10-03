const BASE_URL = 'http://localhost:5000/api';

// DOM Elements
const librarySection = document.getElementById('library-section');
const booksGrid = document.getElementById('books-grid');
const uploadBox = document.getElementById('upload-box');
const pdfInput = document.getElementById('pdf-input');
const btnUploadTrigger = document.getElementById('btn-upload-trigger');
const btnShowLibrary = document.getElementById('btn-show-library');
const btnHome = document.getElementById('btn-home');

const loading = document.getElementById('loading');
const loadingStatus = document.getElementById('loading-status');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

const bookContainer = document.getElementById('book-container');
const controls = document.getElementById('controls');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnGo = document.getElementById('btn-go');
const pageInput = document.getElementById('page-input');
const totalPagesEl = document.getElementById('total-pages');
const btnSoundToggle = document.getElementById('btn-sound-toggle');

// Cấu hình các ô tương tác audio theo từng trang (nếu có)
const hotspotsConfig = {
  5: [
    { audioUrl: 'sounds/U1P5.mp3', x: 10, y: 20, width: 30, height: 10 }
  ]
};

// State
let pageFlip = null;
let bookData = null;
let isUploading = false;
let isSoundEnabled = true;
let currentAudio = null;
let currentAreaEl = null;

const flipAudio = new Audio('sounds/page-flip.mp3');
flipAudio.volume = 0.5;

// ==========================================
// 1. KHI VỪA MỞ TRANG: TỰ ĐỘNG LOAD SÁCH CŨ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  fetchLibraryBooks();
});

async function fetchLibraryBooks() {
  try {
    const res = await fetch(`${BASE_URL}/books`);
    const data = await res.json();

    if (data.success && data.books.length > 0) {
      renderLibrary(data.books);
      showLibraryView();
    } else {
      // Nếu chưa có sách nào trong processed -> Hiển thị hộp upload
      showUploadView();
    }
  } catch (err) {
    console.warn('Chưa kết nối được Server hoặc chưa có sách:', err);
    showUploadView();
  }
}

// Render kệ sách
function renderLibrary(books) {
  booksGrid.innerHTML = '';

  books.forEach(book => {
    const card = document.createElement('div');
    card.className = 'bg-slate-800 rounded-xl overflow-hidden shadow-lg border border-slate-700 hover:border-indigo-500 cursor-pointer transform hover:-translate-y-1 transition duration-200 group';
    
    card.innerHTML = `
      <div class="h-44 bg-slate-900 overflow-hidden relative">
        <img src="${book.coverUrl}" alt="${book.bookName}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
        <div class="absolute bottom-2 right-2 bg-black/70 text-indigo-300 text-xs px-2 py-0.5 rounded">
          ${book.totalPages} trang
        </div>
      </div>
      <div class="p-3">
        <h3 class="text-sm font-semibold truncate text-slate-200" title="${book.bookName}">
          ${book.bookName}
        </h3>
        <p class="text-xs text-indigo-400 mt-1 flex items-center gap-1">
          <i class="fa-solid fa-book-open"></i> Đọc ngay
        </p>
      </div>
    `;

    // Nhấp vào sách đã có -> Mở luôn, không cần upload
    card.addEventListener('click', () => loadBookDirectly(book.bookId));

    booksGrid.appendChild(card);
  });
}

// Đọc sách đã có sẵn từ backend
async function loadBookDirectly(bookId) {
  librarySection.classList.add('hidden');
  uploadBox.classList.add('hidden');
  loading.classList.remove('hidden');
  updateProgress(100, 'Đang mở sách...');

  try {
    const res = await fetch(`${BASE_URL}/books/${bookId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    bookData = data;
    totalPagesEl.textContent = bookData.totalPages;
    pageInput.max = bookData.totalPages;

    setTimeout(() => {
      buildFlipbookDOM();
    }, 200);

  } catch (err) {
    alert('Lỗi khi mở sách: ' + err.message);
    showLibraryView();
  }
}

// ==========================================
// 2. CHUYỂN ĐỔI GIAO DIỆN
// ==========================================
function showLibraryView() {
  librarySection.classList.remove('hidden');
  uploadBox.classList.add('hidden');
  bookContainer.classList.add('hidden');
  controls.classList.add('opacity-50', 'pointer-events-none');
  loading.classList.add('hidden');
}

function showUploadView() {
  librarySection.classList.add('hidden');
  uploadBox.classList.remove('hidden');
  bookContainer.classList.add('hidden');
  controls.classList.add('opacity-50', 'pointer-events-none');
  loading.classList.add('hidden');
}

btnUploadTrigger.addEventListener('click', () => {
  if (!isUploading) pdfInput.click();
});

btnShowLibrary.addEventListener('click', () => {
  fetchLibraryBooks();
});

btnHome.addEventListener('click', () => {
  fetchLibraryBooks();
});

uploadBox.addEventListener('click', () => {
  if (!isUploading) pdfInput.click();
});

// ==========================================
// 3. UPLOAD SÁCH MỚI (NẾU CHƯA CÓ)
// ==========================================
pdfInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file && !isUploading) {
    isUploading = true;
    await uploadAndProcessPDF(file);
    pdfInput.value = '';
    isUploading = false;
  }
});

function uploadAndProcessPDF(file) {
  return new Promise((resolve) => {
    if (file.type !== 'application/pdf') {
      alert('Vui lòng chọn file đúng định dạng .PDF!');
      resolve();
      return;
    }

    librarySection.classList.add('hidden');
    uploadBox.classList.add('hidden');
    loading.classList.remove('hidden');
    updateProgress(0, 'Đang chuẩn bị tải file...');

    const formData = new FormData();
    formData.append('pdf', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/upload`, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        updateProgress(percent, `Đang tải lên (${percent}%)`);
      }
    };

    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          bookData = JSON.parse(xhr.responseText);
          if (!bookData.success) throw new Error(bookData.error);

          updateProgress(100, bookData.fromCache ? 'Đã có sẵn trong cache!' : 'Xử lý hoàn tất!');

          setTimeout(() => {
            totalPagesEl.textContent = bookData.totalPages;
            pageInput.max = bookData.totalPages;
            buildFlipbookDOM();
            resolve();
          }, 300);

        } catch (err) {
          alert('Lỗi: ' + err.message);
          showLibraryView();
          resolve();
        }
      } else {
        alert(`Lỗi Server (${xhr.status})`);
        showLibraryView();
        resolve();
      }
    };

    xhr.onerror = function () {
      alert('Không thể kết nối đến máy chủ!');
      showLibraryView();
      resolve();
    };

    xhr.upload.onloadend = () => {
      updateProgress(100, 'Đang chuyển đổi trang sách...');
    };

    xhr.send(formData);
  });
}

function updateProgress(percent, text) {
  if (loadingStatus) loadingStatus.textContent = text;
  if (progressText) progressText.textContent = `${percent}%`;
  if (progressBar) progressBar.style.width = `${percent}%`;
}

// ==========================================
// 4. HIỂN THỊ SÁCH VÀ HOTSPOTS ÂM THANH
// ==========================================
function buildFlipbookDOM() {
  if (pageFlip) {
    try { pageFlip.destroy(); } catch (e) {}
    pageFlip = null;
  }

  bookContainer.innerHTML = '';

  const newFlipbookEl = document.createElement('div');
  newFlipbookEl.id = 'flipbook';
  bookContainer.appendChild(newFlipbookEl);

  bookData.pages.forEach((page) => {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'page';
    pageDiv.style.position = 'relative';

    const img = document.createElement('img');
    img.dataset.src = page.imageUrl;
    img.dataset.page = page.pageNumber;
    img.classList.add('img-loading');
    pageDiv.appendChild(img);

    // Vẽ hotspot audio nếu trang có cấu hình
    const spots = hotspotsConfig[page.pageNumber];
    if (spots) {
      spots.forEach((spot) => {
        const area = document.createElement('div');
        area.className = 'audio-area';
        area.style.position = 'absolute';
        area.style.left = spot.x + '%';
        area.style.top = spot.y + '%';
        area.style.width = spot.width + '%';
        area.style.height = spot.height + '%';

        area.onclick = (e) => {
          e.stopPropagation();
          playAudio(spot.audioUrl, area);
        };
        pageDiv.appendChild(area);
      });
    }

    newFlipbookEl.appendChild(pageDiv);
  });

  initPageFlip();
}

function initPageFlip() {
  const flipbookEl = document.getElementById('flipbook');

  pageFlip = new St.PageFlip(flipbookEl, {
    width: 450,
    height: 650,
    size: 'stretch',
    minWidth: 300,
    maxWidth: 1000,
    minHeight: 400,
    maxHeight: 900,
    showCover: true,
    maxShadowOpacity: 0.5,
    showPageCorners: false, // Tắt hé góc khi hover
    clickEventForward: false,
    disableFlipByClick: true // Chỉ lật khi kéo chuột
  });

  pageFlip.loadFromHTML(document.querySelectorAll('.page'));

  loading.classList.add('hidden');
  bookContainer.classList.remove('hidden');
  controls.classList.remove('opacity-50', 'pointer-events-none');

  loadImagesAroundPage(1);

  pageFlip.on('changeState', (e) => {
    if (e.data === 'flipping' && isSoundEnabled) {
      flipAudio.currentTime = 0;
      flipAudio.play().catch(() => {});
    }
  });

  pageFlip.on('flip', (e) => {
    const currentPage = e.data + 1;
    pageInput.value = currentPage;
    loadImagesAroundPage(currentPage);

    // Tự dừng audio cũ nếu đổi trang
    if (currentAudio) {
      currentAudio.pause();
      if (currentAreaEl) currentAreaEl.classList.remove('playing');
    }
  });

  btnPrev.onclick = () => pageFlip.flipPrev();
  btnNext.onclick = () => pageFlip.flipNext();
  btnGo.onclick = jumpToPage;
  pageInput.onkeydown = (e) => { if (e.key === 'Enter') jumpToPage(); };
}

function playAudio(audioUrl, element) {
  if (currentAudio) {
    currentAudio.pause();
    if (currentAreaEl) currentAreaEl.classList.remove('playing');
  }

  if (currentAreaEl === element && !currentAudio.paused) return;

  currentAudio = new Audio(audioUrl);
  currentAreaEl = element;
  element.classList.add('playing');
  currentAudio.play();

  currentAudio.onended = () => {
    element.classList.remove('playing');
  };
}

function loadImagesAroundPage(currentPage) {
  const buffer = 3;
  const start = Math.max(1, currentPage - buffer);
  const end = Math.min(bookData.totalPages, currentPage + buffer);

  for (let i = start; i <= end; i++) {
    const img = document.querySelector(`img[data-page="${i}"]`);
    if (img && !img.src) {
      img.src = img.dataset.src;
      img.onload = () => img.classList.remove('img-loading');
    }
  }
}

function jumpToPage() {
  if (!pageFlip || !bookData) return;
  let pageNum = parseInt(pageInput.value);

  if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
  if (pageNum > bookData.totalPages) pageNum = bookData.totalPages;

  pageInput.value = pageNum;
  loadImagesAroundPage(pageNum);
  pageFlip.turnToPage(pageNum - 1);
}

// Bật/tắt âm thanh lật
btnSoundToggle.addEventListener('click', () => {
  isSoundEnabled = !isSoundEnabled;
  const icon = btnSoundToggle.querySelector('i');
  if (isSoundEnabled) {
    icon.className = 'fa-solid fa-volume-high text-sm';
    btnSoundToggle.classList.replace('text-slate-500', 'text-indigo-400');
  } else {
    icon.className = 'fa-solid fa-volume-xmark text-sm';
    btnSoundToggle.classList.replace('text-indigo-400', 'text-slate-500');
  }
});