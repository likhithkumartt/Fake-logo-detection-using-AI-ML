document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. ELEMENT SELECTION ---
    const els = {
        upload: document.getElementById('imageUpload'),
        preview: document.getElementById('previewImg'),
        video: document.getElementById('webcamFeed'),
        canvas: document.getElementById('canvas'),
        scanLine: document.getElementById('scanLine'),
        loader: document.getElementById('loader'),
        placeholder: document.getElementById('placeholderText'),
        predictBtn: document.getElementById('predictFileBtn'),
        webcamBtn: document.getElementById('startWebcamBtn'),
        voiceBtn: document.getElementById('voiceToggleBtn'),
        themeBtn: document.getElementById('themeToggle'),
        scannerWindow: document.getElementById('scannerWindow'),
        
        liveCount: document.getElementById('liveCount'),
        gpu: document.getElementById('gpuTemp'),
        cpu: document.getElementById('cpuUsage'),
        ram: document.getElementById('ramUsage'),
        history: document.getElementById('historyList'),
        clearHistoryBtn: document.getElementById('clearHistoryBtn'),
        
        chatWindow: document.getElementById('chatWindow'),
        chatInput: document.getElementById('chatInput'),
        chatMessages: document.getElementById('chatMessages'),
        clearChatBtn: document.getElementById('clearChatBtn')
    };

    const ctx = els.canvas ? els.canvas.getContext('2d') : null;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    let state = { streaming: false, stream: null, processing: false, voice: true, file: null, lastSpeak: 0 };

    // --- INIT: LOAD HISTORY ---
    loadHistoryData();
    loadChatData();

    // --- 2. THEME ---
    if(localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        if(els.themeBtn) els.themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }
    if(els.themeBtn) {
        els.themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            els.themeBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        });
    }

    // --- 3. UPLOAD ---
    function processFile(file) {
        state.file = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            els.preview.src = ev.target.result;
            els.preview.style.display = 'block';
            if(els.placeholder) els.placeholder.style.display = 'none';
            if(els.video) els.video.style.display = 'none';
            if(els.predictBtn) {
                els.predictBtn.style.display = 'inline-block';
                els.predictBtn.innerText = "Analyze Image";
            }
            if(ctx) ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
            if(els.scanLine) els.scanLine.style.display = 'block';
            stopWebcam();
        };
        reader.readAsDataURL(state.file);
    }

    if(els.upload) els.upload.addEventListener('change', (e) => { if(e.target.files[0]) processFile(e.target.files[0]); });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => document.body.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }));
    document.body.addEventListener('dragover', () => { if(els.scannerWindow) els.scannerWindow.classList.add('dragging'); });
    ['dragleave', 'drop'].forEach(evt => document.body.addEventListener(evt, () => { if(els.scannerWindow) els.scannerWindow.classList.remove('dragging'); }));
    document.body.addEventListener('drop', (e) => { if(e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]); });

    // --- 4. PREDICT ---
    if(els.predictBtn) {
        els.predictBtn.addEventListener('click', async () => {
            if(!state.file) return;
            const fd = new FormData(); fd.append('file', state.file);
            if(els.loader) els.loader.style.display = 'flex';
            if (audioCtx.state === 'suspended') audioCtx.resume();

            try {
                const res = await fetch('/predict', {method:'POST', body:fd});
                const data = await res.json();
                if(els.scanLine) els.scanLine.style.display = 'none';
                drawDetections(data);
                if(data.length > 0) setTimeout(loadHistoryData, 500);
            } catch(e) { console.error(e); alert("Error."); } 
            finally { if(els.loader) els.loader.style.display = 'none'; }
        });
    }

    // --- 5. WEBCAM LOOP ---
    function stopWebcam() {
        state.streaming = false;
        if(state.stream) state.stream.getTracks().forEach(t=>t.stop());
        if(els.webcamBtn) {
            els.webcamBtn.innerHTML = '<i class="fas fa-video"></i> Live Cam';
            els.webcamBtn.classList.remove('btn-black');
        }
        if(els.scanLine) els.scanLine.style.display = 'none';
        state.processing = false;
    }

    async function processFrame() {
        if(!state.streaming) return;
        if(state.processing) { requestAnimationFrame(processFrame); return; }
        if(!ctx || els.video.readyState !== 4 || els.video.videoWidth === 0) { requestAnimationFrame(processFrame); return; }

        state.processing = true;
        const c = document.createElement('canvas');
        c.width = els.video.videoWidth; 
        c.height = els.video.videoHeight;
        c.getContext('2d').drawImage(els.video, 0,0);
        
        c.toBlob(async blob => {
            const fd = new FormData(); fd.append('file', blob, 'frame.jpg');
            try {
                const res = await fetch('/predict', {method:'POST', body:fd});
                const data = await res.json();
                drawDetections(data);
            } catch(e) { } 
            finally { 
                state.processing = false;
                requestAnimationFrame(processFrame); 
            }
        }, 'image/jpeg', 0.5);
    }

    if(els.webcamBtn) {
        els.webcamBtn.addEventListener('click', () => {
            if (audioCtx.state === 'suspended') audioCtx.resume();

            if(!state.streaming) {
                navigator.mediaDevices.getUserMedia({video:{ facingMode: "environment" }}).then(s => {
                    state.stream = s; els.video.srcObject = s;
                    els.video.style.display = 'block';
                    els.preview.style.display = 'none';
                    if(els.placeholder) els.placeholder.style.display = 'none';
                    if(els.predictBtn) els.predictBtn.style.display = 'none';
                    if(els.scanLine) els.scanLine.style.display = 'none';
                    
                    state.streaming = true;
                    els.webcamBtn.classList.add('btn-black');
                    els.webcamBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Cam';
                    
                    processFrame();

                }).catch(e => alert("Webcam error."));
            } else {
                stopWebcam();
                els.video.style.display = 'none';
                if(els.placeholder) els.placeholder.style.display = 'flex';
                if(ctx) ctx.clearRect(0,0,els.canvas.width, els.canvas.height);
            }
        });
    }

    // --- 6. DRAWING LOGIC ---
    function drawDetections(detections) {
        if(els.liveCount) els.liveCount.innerText = detections.length;
        
        const media = state.streaming ? els.video : els.preview;
        if (!media || media.clientWidth === 0) return;

        els.canvas.width = media.clientWidth;
        els.canvas.height = media.clientHeight;

        const sx = els.canvas.width / (media.videoWidth || media.naturalWidth);
        const sy = els.canvas.height / (media.videoHeight || media.naturalHeight);

        if(ctx) {
            ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
            
            let fakeCount = 0;
            let realCount = 0;

            detections.forEach(d => {
                const [x1, y1, x2, y2] = d.box;
                const isFake = d.class_name.toLowerCase().includes('fake') || d.is_fake === 1;
                const color = isFake ? '#e74c3c' : '#2ecc71';

                if(isFake) fakeCount++; else realCount++;

                ctx.beginPath();
                ctx.lineWidth = 3;
                ctx.strokeStyle = color;
                ctx.rect(x1 * sx, y1 * sy, (x2 - x1) * sx, (y2 - y1) * sy);
                ctx.stroke();

                ctx.fillStyle = color;
                ctx.font = "bold 14px Poppins";
                const text = `${d.class_name}`;
                const tw = ctx.measureText(text).width + 10;
                
                let labelY = (y1 * sy) < 25 ? (y1 * sy) : (y1 * sy) - 24;
                let textY = (y1 * sy) < 25 ? (y1 * sy) + 17 : (y1 * sy) - 7;

                ctx.fillRect(x1 * sx, labelY, tw, 24);
                ctx.fillStyle = "white";
                ctx.fillText(text, (x1 * sx) + 5, textY);
            });

            if(detections.length > 0) triggerSound(fakeCount, realCount);
        }
    }

    // --- 7. AUDIO ---
    if(els.voiceBtn) {
        els.voiceBtn.addEventListener('click', () => {
            state.voice = !state.voice;
            els.voiceBtn.innerHTML = state.voice ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
            if(state.voice && audioCtx.state === 'suspended') audioCtx.resume();
        });
    }

    function triggerSound(fakeCount, realCount) {
        if(!state.voice) return;
        const now = Date.now();
        if(now - state.lastSpeak < 3000) return;
        
        if (fakeCount > 0 && realCount > 0) {
            playTone(150, 'sawtooth', 0.3);
            speak(`${fakeCount} fake logos and ${realCount} real logos detected.`);
        } 
        else if (fakeCount > 0) {
            playTone(150, 'sawtooth', 0.3); 
            speak("Fake Logo Detected.");
        } 
        else if (realCount > 0) {
            playTone(800, 'sine', 0.1); 
            speak("Real Logo Detected.");
        }
        state.lastSpeak = now;
    }

    function playTone(freq, type, duration) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
        osc.stop(audioCtx.currentTime + duration);
    }

    function speak(txt) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(txt));
    }

    // --- 8. PERSISTENT HISTORY ---
    
    async function loadHistoryData() {
        try {
            const res = await fetch('/api/history/scans');
            const history = await res.json();
            els.history.innerHTML = history.length ? '' : '<div class="empty-state">No scans yet</div>';
            
            history.forEach(d => {
                const isFake = d.is_fake === 1 || (d.class_name && d.class_name.toLowerCase().includes('fake'));
                const thumb = d.thumbnail || ''; 
                const html = `
                    <div class="history-item ${isFake?'fake':'real'}">
                        ${thumb ? `<img src="${thumb}" class="history-thumb">` : '<div class="history-thumb" style="background:#eee"></div>'}
                        <div>
                            <div style="font-weight:bold;">${d.class_name}</div>
                            <div style="font-size:0.8rem; color:#888;">${(d.confidence*100).toFixed(0)}% • ${d.time}</div>
                        </div>
                    </div>`;
                els.history.insertAdjacentHTML('beforeend', html);
            });
        } catch(e) { console.log("History Error", e); }
    }

    async function loadChatData() {
        try {
            const res = await fetch('/api/history/chat');
            const chats = await res.json();
            els.chatMessages.innerHTML = '';
            // UPDATED DEFAULT MESSAGE
            if(chats.length === 0) els.chatMessages.innerHTML = '<div class="bot-msg">Hello! I am logo LIES AI. How can I help?</div>';
            chats.forEach(c => addMsg(c.message, c.sender === 'user'));
        } catch(e) {}
    }

    if(els.clearHistoryBtn) {
        els.clearHistoryBtn.addEventListener('click', async () => {
            if(confirm("Delete all scan history?")) {
                await fetch('/api/history/scans', {method: 'DELETE'});
                els.history.innerHTML = '<div class="empty-state">No scans yet</div>';
            }
        });
    }
    
    if(els.clearChatBtn) {
        els.clearChatBtn.addEventListener('click', async () => {
            if(confirm("Clear chat history?")) {
                await fetch('/api/history/chat', {method: 'DELETE'});
                // UPDATED DEFAULT MESSAGE
                els.chatMessages.innerHTML = '<div class="bot-msg">Hello! I am logo LIES AI. How can I help?</div>';
            }
        });
    }

    window.toggleChat = function() { els.chatWindow.style.display = els.chatWindow.style.display === 'flex' ? 'none' : 'flex'; };
    window.handleEnter = function(e) { if(e.key==='Enter') sendMessage(); };
    async function sendMessage() {
        const msg = els.chatInput.value.trim(); if(!msg) return;
        addMsg(msg, true); els.chatInput.value='';
        try {
            const res = await fetch('/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message:msg})});
            const d = await res.json();
            addMsg(d.response, false);
        } catch(e) { addMsg("Offline.", false); }
    }
    function addMsg(txt, isUser) {
        const div = document.createElement('div');
        div.className = isUser ? 'user-msg' : 'bot-msg';
        div.innerText = txt;
        els.chatMessages.appendChild(div);
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }

    function updateStats() {
        fetch('/system_stats').then(r => r.json()).then(d => {
            if(els.gpu) els.gpu.innerText = d.gpu || "--";
            if(els.cpu) els.cpu.innerText = (d.cpu || 0) + "%";
            if(els.ram) els.ram.innerText = (d.ram || 0) + "%";
        }).catch(()=>{});
    }
    setInterval(updateStats, 2000); updateStats();
});