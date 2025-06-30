// Global variables
let currentImageFile = null;
let currentHistoryId = null;
let currentAttentionMaps = [];
let currentWords = [];

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const previewSection = document.getElementById('previewSection');
const imagePreview = document.getElementById('imagePreview');
const generateBtn = document.getElementById('generateBtn');
const resultsSection = document.getElementById('resultsSection');
const generatedCaption = document.getElementById('generatedCaption');
const loadingSpinner = document.getElementById('loadingSpinner');
const historyList = document.getElementById('historyList');
const attentionOverlay = document.getElementById('attentionOverlay');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadHistory();
});

// Setup event listeners
function setupEventListeners() {
    // File input change
    imageInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop events
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    
    // Click to upload - only if no file is currently selected
    uploadArea.addEventListener('click', (event) => {
        // Don't trigger if clicking on the button (it has its own handler)
        if (event.target.closest('.upload-btn')) {
            return;
        }
        // Only trigger file input if no file is currently selected
        if (!currentImageFile) {
            imageInput.click();
        }
    });
}

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        processImageFile(file);
    } else {
        showToast('Please select a valid image file.', 'error');
        // Reset the input to allow re-selection of the same file
        event.target.value = '';
    }
}

// Handle drag over
function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    uploadArea.classList.add('dragover');
}

// Handle drag leave
function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    uploadArea.classList.remove('dragover');
}

// Handle drop
function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    uploadArea.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
            processImageFile(file);
        } else {
            showToast('Please drop a valid image file.', 'error');
        }
    }
}

// Process image file
function processImageFile(file) {
    try {
        // Validate file
        if (!file) {
            showToast('No file selected.', 'error');
            return;
        }
        
        if (!file.type.startsWith('image/')) {
            showToast('Please select a valid image file.', 'error');
            return;
        }
        
        // Validate file size (16MB limit)
        if (file.size > 16 * 1024 * 1024) {
            showToast('File size must be less than 16MB.', 'error');
            return;
        }
        
        currentImageFile = file;
        
        // Create preview
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            previewSection.style.display = 'block';
            resultsSection.style.display = 'none';
            showToast('Image uploaded successfully!', 'success');
        };
        reader.onerror = function() {
            showToast('Error reading image file.', 'error');
        };
        reader.readAsDataURL(file);
        
    } catch (error) {
        console.error('Error processing image:', error);
        showToast('Error processing image file.', 'error');
    }
}

// Remove image
function removeImage() {
    currentImageFile = null;
    currentHistoryId = null;
    currentAttentionMaps = [];
    currentWords = [];
    
    // Reset file input
    imageInput.value = '';
    
    // Hide sections
    previewSection.style.display = 'none';
    resultsSection.style.display = 'none';
    uploadArea.classList.remove('dragover');
    
    // Clear any existing attention overlay
    if (attentionOverlay) {
        attentionOverlay.style.display = 'none';
    }
}

// Reset file input for new uploads
function resetFileInput() {
    imageInput.value = '';
}

// Trigger file input selection
function triggerFileInput() {
    // Reset the file input first to ensure it can be triggered
    imageInput.value = '';
    // Trigger the file input
    imageInput.click();
}

// Generate caption
async function generateCaption() {
    if (!currentImageFile) {
        showToast('Please upload an image first.', 'error');
        return;
    }
    
    // Show loading state
    generateBtn.disabled = true;
    loadingSpinner.style.display = 'block';
    resultsSection.style.display = 'block';
    generatedCaption.textContent = '';
    
    try {
        const formData = new FormData();
        formData.append('image', currentImageFile);
        
        const response = await fetch('/generate_caption', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            generatedCaption.textContent = data.caption;
            currentHistoryId = data.history_id;
            showToast('Caption generated successfully!', 'success');
            
            // Reset file input to allow new uploads
            resetFileInput();
            
            // Reload history to show new entry
            loadHistory();
        } else {
            throw new Error(data.error || 'Failed to generate caption');
        }
    } catch (error) {
        console.error('Error:', error);
        generatedCaption.textContent = 'Error generating caption. Please try again.';
        showToast('Failed to generate caption. Please try again.', 'error');
    } finally {
        generateBtn.disabled = false;
        loadingSpinner.style.display = 'none';
    }
}

// Copy caption to clipboard
async function copyCaption() {
    const caption = generatedCaption.textContent;
    if (!caption || caption === 'Error generating caption. Please try again.') {
        showToast('No caption to copy.', 'error');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(caption);
        showToast('Caption copied to clipboard!', 'success');
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = caption;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Caption copied to clipboard!', 'success');
    }
}

// Download caption
function downloadCaption() {
    if (!currentHistoryId) {
        showToast('No caption to download.', 'error');
        return;
    }
    
    window.open(`/download_caption/${currentHistoryId}`, '_blank');
    showToast('Download started!', 'success');
}

// Share caption
async function shareCaption() {
    const caption = generatedCaption.textContent;
    if (!caption || caption === 'Error generating caption. Please try again.') {
        showToast('No caption to share.', 'error');
        return;
    }
    
    // Check if Web Share API is supported
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'AI Generated Caption',
                text: caption,
                url: window.location.href
            });
        } catch (error) {
            console.log('Share cancelled or failed');
        }
    } else {
        // Fallback: copy to clipboard
        await copyCaption();
    }
}

// Load history
async function loadHistory() {
    try {
        const response = await fetch('/history');
        const history = await response.json();
        
        if (Array.isArray(history)) {
            displayHistory(history);
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// Display history
function displayHistory(history) {
    if (history.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #6b7280; grid-column: 1 / -1;">No captions generated yet. Upload an image to get started!</p>';
        return;
    }
    
    historyList.innerHTML = history.reverse().map(item => `
        <div class="history-item">
            <img src="data:image/jpeg;base64,${item.image_data}" alt="History image">
            <div class="caption">${item.caption}</div>
            <div class="timestamp">${formatTimestamp(item.timestamp)}</div>
            <div class="actions">
                <button class="action-btn copy-btn" onclick="copyHistoryCaption('${item.caption}')">
                    <i class="fas fa-copy"></i>
                    Copy
                </button>
                <button class="action-btn download-btn" onclick="downloadHistoryCaption('${item.id}')">
                    <i class="fas fa-download"></i>
                    Download
                </button>
                <button class="action-btn share-btn" onclick="shareHistoryCaption('${item.caption}')">
                    <i class="fas fa-share-alt"></i>
                    Share
                </button>
            </div>
        </div>
    `).join('');
}

// Format timestamp
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) {
        return 'Just now';
    } else if (diffInMinutes < 60) {
        return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    } else if (diffInMinutes < 1440) {
        const hours = Math.floor(diffInMinutes / 60);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
}

// Copy history caption
async function copyHistoryCaption(caption) {
    try {
        await navigator.clipboard.writeText(caption);
        showToast('Caption copied to clipboard!', 'success');
    } catch (error) {
        const textArea = document.createElement('textarea');
        textArea.value = caption;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Caption copied to clipboard!', 'success');
    }
}

// Download history caption
function downloadHistoryCaption(historyId) {
    window.open(`/download_caption/${historyId}`, '_blank');
    showToast('Download started!', 'success');
}

// Share history caption
async function shareHistoryCaption(caption) {
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'AI Generated Caption',
                text: caption,
                url: window.location.href
            });
        } catch (error) {
            console.log('Share cancelled or failed');
        }
    } else {
        await copyHistoryCaption(caption);
    }
}

// Clear history
async function clearHistory() {
    if (!confirm('Are you sure you want to clear all history? This action cannot be undone.')) {
        return;
    }
    
    try {
        // Clear the history.json file by overwriting it with empty array
        const response = await fetch('/history', {
            method: 'DELETE'
        });
        
        if (response.ok) {
            historyList.innerHTML = '<p style="text-align: center; color: #6b7280; grid-column: 1 / -1;">No captions generated yet. Upload an image to get started!</p>';
            showToast('History cleared successfully!', 'success');
        } else {
            throw new Error('Failed to clear history');
        }
    } catch (error) {
        console.error('Error clearing history:', error);
        showToast('Failed to clear history. Please try again.', 'error');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fas fa-check-circle' : 
                 type === 'error' ? 'fas fa-exclamation-circle' : 
                 'fas fa-info-circle';
    
    toast.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Add slideOut animation to CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Keyboard shortcuts
document.addEventListener('keydown', function(event) {
    // Ctrl/Cmd + Enter to generate caption
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (currentImageFile && !generateBtn.disabled) {
            generateCaption();
        }
    }
    
    // Escape to remove image
    if (event.key === 'Escape') {
        if (currentImageFile) {
            removeImage();
        }
    }
});

// Add some nice hover effects and animations
document.addEventListener('DOMContentLoaded', function() {
    // Add intersection observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe cards for animation
    const cards = document.querySelectorAll('.upload-card, .results-card, .history-card');
    cards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
});

// Create heatmap overlay
function createHeatmapOverlay(attentionMap) {
    // Clear previous overlay
    attentionOverlay.innerHTML = '';
    
    // Create canvas for heatmap
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match image
    const img = attentionImage;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    // Create heatmap with better visibility
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;
    
    // Find min and max values for better contrast
    let minVal = Infinity, maxVal = -Infinity;
    for (let y = 0; y < attentionMap.length; y++) {
        for (let x = 0; x < attentionMap[y].length; x++) {
            const val = attentionMap[y][x];
            if (val < minVal) minVal = val;
            if (val > maxVal) maxVal = val;
        }
    }
    
    const range = maxVal - minVal;
    
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const index = (y * canvas.width + x) * 4;
            
            // Get attention value and normalize
            const attentionValue = attentionMap[y] ? attentionMap[y][x] || 0 : 0;
            const normalizedValue = range > 0 ? (attentionValue - minVal) / range : 0;
            
            // Create more vibrant heatmap colors
            let r, g, b;
            if (normalizedValue < 0.5) {
                // Blue to cyan transition
                const t = normalizedValue * 2;
                r = 0;
                g = Math.floor(255 * t);
                b = 255;
            } else {
                // Cyan to red transition
                const t = (normalizedValue - 0.5) * 2;
                r = Math.floor(255 * t);
                g = 255;
                b = Math.floor(255 * (1 - t));
            }
            
            data[index] = r;     // Red
            data[index + 1] = g; // Green
            data[index + 2] = b; // Blue
            data[index + 3] = Math.floor(normalizedValue * 180 + 75); // Alpha (more visible)
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Add canvas to overlay
    attentionOverlay.appendChild(canvas);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.borderRadius = '10px';
    
    // Add a subtle glow effect
    canvas.style.filter = 'drop-shadow(0 0 10px rgba(79, 70, 229, 0.3))';
}

// Show attention for specific word
function showWordAttention(wordIndex) {
    if (wordIndex >= 0 && wordIndex < currentAttentionMaps.length) {
        // Remove active class from all words
        document.querySelectorAll('.word-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to clicked word
        document.querySelectorAll('.word-item')[wordIndex].classList.add('active');
        
        // Show attention overlay
        const attentionMap = currentAttentionMaps[wordIndex];
        if (attentionMap) {
            createHeatmapOverlay(attentionMap);
            attentionOverlay.classList.add('active');
            
            // Show which word is being highlighted
            const word = currentWords[wordIndex];
            showToast(`Showing attention for: "${word}"`, 'info');
        }
    }
}

// Show all attention
function showAllAttention() {
    if (currentAttentionMaps.length > 0) {
        // Create combined attention map with better weighting
        const combinedMap = [];
        const maxHeight = Math.max(...currentAttentionMaps.map(map => map.length));
        const maxWidth = Math.max(...currentAttentionMaps.map(map => map[0]?.length || 0));
        
        // Initialize combined map
        for (let y = 0; y < maxHeight; y++) {
            combinedMap[y] = [];
            for (let x = 0; x < maxWidth; x++) {
                combinedMap[y][x] = 0;
            }
        }
        
        // Combine all attention maps with equal weighting
        currentAttentionMaps.forEach(map => {
            for (let y = 0; y < map.length && y < maxHeight; y++) {
                for (let x = 0; x < map[y].length && x < maxWidth; x++) {
                    combinedMap[y][x] += map[y][x];
                }
            }
        });
        
        // Normalize combined map
        let maxVal = 0;
        for (let y = 0; y < combinedMap.length; y++) {
            for (let x = 0; x < combinedMap[y].length; x++) {
                if (combinedMap[y][x] > maxVal) maxVal = combinedMap[y][x];
            }
        }
        
        if (maxVal > 0) {
            for (let y = 0; y < combinedMap.length; y++) {
                for (let x = 0; x < combinedMap[y].length; x++) {
                    combinedMap[y][x] = combinedMap[y][x] / maxVal;
                }
            }
        }
        
        createHeatmapOverlay(combinedMap);
        attentionOverlay.classList.add('active');
        
        // Remove active class from all words
        document.querySelectorAll('.word-item').forEach(item => {
            item.classList.remove('active');
        });
        
        showToast('Showing attention for all words combined!', 'info');
    }
} 