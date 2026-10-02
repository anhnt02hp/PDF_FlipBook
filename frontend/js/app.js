const API_URL = 'http://localhost:5000/api/upload';

// DOM Elements
const pdfInput = document.getElementById('pdf-input');
const btnUploadTrigger = document.getElementById('btn-upload-trigger');
const uploadBox = document.getElementById('upload-box');
const loading = document.getElementById('loading');
const loadingStatus = document.getElementById('loading-status');
const progressBar = document.getElementById('progress-bar'); // Cần div này để hiện %
const progressText = document.getElementById('progress-text'); // Số % ví dụ: 45%

const bookContainer = document.getElementById('book-container');
const controls = document.getElementById('controls');

const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnGo = document.getElementById('btn-go');
const pageInput = document.getElementById('page-input');
const totalPagesEl = document.getElementById('total-pages');
const btnSoundToggle = document.getElementById('btn-sound-toggle');

// State
let pageFlip = null;
let bookData = null;
let isUploading = false;
let isSoundEnabled = true;

const flipAudio = new Audio('sounds/page-flip.mp3');
flipAudio.volume = 0.5;

// Khai báo các vùng phát audio cho từng trang (x, y, width, height tính theo %)
const hotspotsConfig = {
  5: [ // Trang 5
    { audioUrl: 'sounds/U1P5.MP3', x: 10, y: 20, width: 30, height: 10 }
  ],
};

let currentAudio = null;
let currentAreaEl = null;

// Hàm phát audio
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


// CLICK TRIGGER UPLOAD (Mở hộp chọn file mượt mà)
if (btnUploadTrigger) {
  btnUploadTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    if (!isUploading) pdfInput.click();
  });
}

if (uploadBox) {
  uploadBox.addEventListener('click', (e) => {
    // Chỉ kích hoạt nếu không bấm vào các nút bên trong
    if (e.target === uploadBox || e.target.closest('#btn-upload-trigger')) {
      if (!isUploading) pdfInput.click();
    }
  });
}

pdfInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file && !isUploading) {
    isUploading = true;
    await uploadAndProcessPDF(file);
    pdfInput.value = '';
    isUploading = false;
  }
});

// SOUND TOGGLE
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

// UPLOAD DÙNG XHR ĐỂ HIỂN THỊ % LOADING
function uploadAndProcessPDF(file) {
  return new Promise((resolve) => {
    if (file.type !== 'application/pdf') {
      alert('Vui lòng chọn file đúng định dạng .PDF!');
      resolve();
      return;
    }

    uploadBox.classList.add('hidden');
    loading.classList.remove('hidden');
    updateProgress(0, 'Đang chuẩn bị tải file...');

    const formData = new FormData();
    formData.append('pdf', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL, true);

    // Theo dõi tiến trình Tải file lên Server (% Upload)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        updateProgress(percentComplete, `Đang tải file lên Server (${percentComplete}%)`);
      }
    };

    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          bookData = JSON.parse(xhr.responseText);
          if (!bookData.success) throw new Error(bookData.error || 'Xử lý thất bại');

          if (bookData.fromCache) {
            updateProgress(100, 'Đã tìm thấy bản sao sẵn có! Đang hiển thị...');
          } else {
            updateProgress(100, 'Tải xong! Đang khởi tạo Flipbook...');
          }

          setTimeout(() => {
            totalPagesEl.textContent = bookData.totalPages;
            pageInput.max = bookData.totalPages;
            buildFlipbookDOM();
            resolve();
          }, 300);

        } catch (err) {
          alert('Lỗi dữ liệu: ' + err.message);
          resetUploadState();
          resolve();
        }
      } else {
        alert(`Lỗi Server (${xhr.status})`);
        resetUploadState();
        resolve();
      }
    };

    xhr.onerror = function () {
      alert('Không thể kết nối đến Server backend!');
      resetUploadState();
      resolve();
    };

    // Chuyển sang trạng thái chờ Server cắt ảnh khi Upload đã đủ 100%
    xhr.upload.onloadend = () => {
      updateProgress(100, 'Đang xử lý & kiểm tra cache trên Server...');
    };

    xhr.send(formData);
  });
}

function updateProgress(percent, text) {
  if (loadingStatus) loadingStatus.textContent = text;
  if (progressText) progressText.textContent = `${percent}%`;
  if (progressBar) progressBar.style.width = `${percent}%`;
}

function resetUploadState() {
  loading.classList.add('hidden');
  uploadBox.classList.remove('hidden');
}

// DỰNG DOM VÀ KHỞI TẠO FLIPBOOK
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


    const spots = hotspotsConfig[page.pageNumber];
    if (spots) {
      spots.forEach((spot) => {
        const area = document.createElement('div');
        area.className = 'audio-area';
        area.style.left = spot.x + '%';
        area.style.top = spot.y + '%';
        area.style.width = spot.width + '%';
        area.style.height = spot.height + '%';

        area.onclick = (e) => {
          e.stopPropagation(); // Không cho lật trang khi click ô audio
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
    showPageCorners: false,
    // Cấu hình vô hiệu hóa nhấp chuột để lật trang
    clickEventForward: false,
    disableFlipByClick: true // TẮT TÍNH NĂNG CLICK LẬT TRANG (CHỈ CHO KÉO/DRAG)
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
  });

  btnPrev.onclick = () => pageFlip.flipPrev();
  btnNext.onclick = () => pageFlip.flipNext();
  btnGo.onclick = jumpToPage;
  pageInput.onkeydown = (e) => { if (e.key === 'Enter') jumpToPage(); };
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