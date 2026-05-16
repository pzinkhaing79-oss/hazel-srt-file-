const apiKeyInput = document.getElementById('apiKey');
const apiModelSelect = document.getElementById('apiModel'); // Model Selector ထပ်တိုးထားခြင်း
const srtFileInput = document.getElementById('srtFile');
const srtInputText = document.getElementById('srtInputText');
const fileNameDisplay = document.getElementById('fileName');
const startBtn = document.getElementById('startBtn');
const resumeBtn = document.getElementById('resumeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');
const statusText = document.getElementById('statusText');
const percentageText = document.getElementById('percentageText');
const progressFill = document.getElementById('progressFill');

// Preview Elements
const extractedPreview = document.getElementById('extractedPreview');
const translatedPreview = document.getElementById('translatedPreview');
const finalOutput = document.getElementById('finalOutput');

let srtBlocks = [];
let translatedBlocks = [];
let isTranslating = false;
const CHUNK_SIZE = 20; 

// 1. File Uploading or Text Pasting
srtFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileNameDisplay.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (event) => {
            srtInputText.value = event.target.result;
            parseSRT(srtInputText.value);
            checkResumeStatus();
        };
        reader.readAsText(file);
    }
});

srtInputText.addEventListener('input', () => {
    fileNameDisplay.textContent = "Manual Text Input";
    parseSRT(srtInputText.value);
    checkResumeStatus();
});

// 2. SRT Parsing
function parseSRT(data) {
    const blocks = data.replace(/\r/g, '').split('\n\n').filter(block => block.trim() !== '');
    srtBlocks = blocks.map(block => {
        const lines = block.split('\n');
        return {
            id: lines[0] || '',
            time: lines[1] || '',
            text: lines.slice(2).join('\n')
        };
    });
    translatedBlocks = new Array(srtBlocks.length).fill(null);
    extractedPreview.value = "SRT စာကြောင်းရေ စုစုပေါင်း: " + srtBlocks.length + " ကြောင်း တွေ့ရှိပါသည်။\nStart Translate ကိုနှိပ်ပါ။";
    translatedPreview.value = "";
    finalOutput.value = "";
}

// 3. Auto-Save Progress System
function checkResumeStatus() {
    const savedData = localStorage.getItem('hazel_srt_pro_v2');
    if (savedData) {
        const parsedData = JSON.parse(savedData);
        if (parsedData.total === srtBlocks.length && srtBlocks.length > 0) {
            translatedBlocks = parsedData.translated;
            const completed = translatedBlocks.filter(t => t !== null).length;
            updateProgress(completed, srtBlocks.length);
            if (completed > 0 && completed < srtBlocks.length) {
                resumeBtn.style.display = 'inline-flex';
                statusText.textContent = "ရပ်တန့်သွားသော နေရာမှ ပြန်ဆက်နိုင်ပါသည်။";
            } else if (completed === srtBlocks.length && completed > 0) {
                finishTranslation();
            }
        } else {
            localStorage.removeItem('hazel_srt_pro_v2');
        }
    }
}

function saveProgress() {
    localStorage.setItem('hazel_srt_pro_v2', JSON.stringify({
        total: srtBlocks.length,
        translated: translatedBlocks
    }));
}

startBtn.addEventListener('click', () => startProcess(false));
resumeBtn.addEventListener('click', () => startProcess(true));

// 4. Main Translation Process
async function startProcess(isResume) {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) return alert('Gemini API Key ကို ထည့်ပေးပါ!');
    if (srtBlocks.length === 0) return alert('SRT စာသားများကို အရင်ထည့်သွင်းပါ!');

    if (!isResume) {
        translatedBlocks = new Array(srtBlocks.length).fill(null);
        localStorage.removeItem('hazel_srt_pro_v2');
        finalOutput.value = "";
    }

    isTranslating = true;
    startBtn.disabled = true;
    resumeBtn.style.display = 'none';
    srtInputText.disabled = true;
    apiModelSelect.disabled = true; // အလုပ်လုပ်နေစဉ် Model ပြောင်း၍မရအောင် ပိတ်ထားမည်

    for (let i = 0; i < srtBlocks.length; i += CHUNK_SIZE) {
        if (!isTranslating) break;
        if (translatedBlocks[i] !== null) continue;

        const chunk = srtBlocks.slice(i, i + CHUNK_SIZE);
        const rawTextArray = chunk.map(b => b.text.replace(/\n/g, ' '));
        extractedPreview.value = rawTextArray.join('\n\n---\n\n');
        
        const textToTranslate = rawTextArray.join(' ||| ');
        statusText.textContent = `အပိုင်း ${i + 1} မှ ${Math.min(i + CHUNK_SIZE, srtBlocks.length)} ကို ဘာသာပြန်နေသည်...`;
        
        try {
            const translatedText = await translateWithGemini(textToTranslate, apiKey);
            const translatedArray = translatedText.split('|||').map(t => t.trim());

            translatedPreview.value = translatedArray.join('\n\n---\n\n');

            if (translatedArray.length === chunk.length) {
                for (let j = 0; j < chunk.length; j++) {
                    translatedBlocks[i + j] = translatedArray[j];
                }
                saveProgress();
                updateProgress(i + chunk.length, srtBlocks.length);
                
                finalOutput.value = generateFinalSRT();
                finalOutput.scrollTop = finalOutput.scrollHeight; 
            } else {
                throw new Error("စာကြောင်းအရေအတွက် မကိုက်ညီပါ။");
            }
        } catch (error) {
            console.error(error);
            statusText.textContent = `Error ဖြစ်ပွားသည်။ API Model ဗားရှင်းကို ပြောင်းလဲရွေးချယ်ကြည့်ပါ။`;
            isTranslating = false;
            startBtn.disabled = false;
            srtInputText.disabled = false;
            apiModelSelect.disabled = false;
            resumeBtn.style.display = 'inline-flex';
            break;
        }

        await new Promise(r => setTimeout(r, 2000)); 
    }

    if (translatedBlocks.filter(t => t !== null).length === srtBlocks.length) {
        finishTranslation();
    }
}

// 5. API ချိတ်ဆက်ခြင်း (ရွေးချယ်ထားသော Model ဗားရှင်းအလိုက် Dynamic အလုပ်လုပ်မည်)
async function translateWithGemini(text, apiKey) {
    const selectedModel = apiModelSelect.value; // Dropdown မှ Model နာမည်ကို ယူခြင်း
    const prompt = `Translate the following English subtitles to strictly natural Myanmar (Burmese) language. The subtitles are separated by " ||| ". You MUST return the translation strictly separated by " ||| " in the exact same quantity. Do not add any extra text, notes, or markdown. Just the translated text.\n\nInput:\n${text}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        throw new Error('API Request Failed');
    }
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

function updateProgress(current, total) {
    const percent = Math.round((current / total) * 100);
    progressFill.style.width = `${percent}%`;
    percentageText.textContent = `${percent}%`;
}

function finishTranslation() {
    isTranslating = false;
    statusText.textContent = "ဘာသာပြန်ခြင်း အောင်မြင်စွာ ပြီးဆုံးပါပြီ။";
    startBtn.disabled = false;
    startBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Translate Another';
    srtInputText.disabled = false;
    apiModelSelect.disabled = false;
    downloadBtn.disabled = false;
    copyBtn.disabled = false;
    finalOutput.value = generateFinalSRT();
}

// 6. Final SRT ပြန်လည်ပေါင်းစပ်ခြင်း
function generateFinalSRT() {
    let finalSrt = '';
    for (let i = 0; i < srtBlocks.length; i++) {
        if (!srtBlocks[i].id || !srtBlocks[i].time) continue;
        finalSrt += `${srtBlocks[i].id}\n`;
        finalSrt += `${srtBlocks[i].time}\n`;
        finalSrt += `${translatedBlocks[i] ? translatedBlocks[i] : srtBlocks[i].text}\n\n`;
    }
    return finalSrt.trim();
}

downloadBtn.addEventListener('click', () => {
    const srtContent = generateFinalSRT();
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    let outName = fileNameDisplay.textContent !== "Manual Text Input" ? fileNameDisplay.textContent : "Subtitle";
    a.download = `Hazel_MM_${outName}.srt`;
    a.click();
});

copyBtn.addEventListener('click', () => {
    const srtContent = generateFinalSRT();
    navigator.clipboard.writeText(srtContent).then(() => {
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => {
            copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy SRT';
        }, 2000);
    });
});
