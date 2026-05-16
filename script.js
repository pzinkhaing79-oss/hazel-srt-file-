const apiKeyInput = document.getElementById('apiKey');
const srtFileInput = document.getElementById('srtFile');
const fileNameDisplay = document.getElementById('fileName');
const startBtn = document.getElementById('startBtn');
const resumeBtn = document.getElementById('resumeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');
const statusText = document.getElementById('statusText');
const percentageText = document.getElementById('percentageText');
const progressFill = document.getElementById('progressFill');

let srtBlocks = [];
let translatedBlocks = [];
let isTranslating = false;
const CHUNK_SIZE = 20; // စာကြောင်း ၂၀ စီခွဲပို့မည်

// ဖိုင်ရွေးချယ်ခြင်း
srtFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileNameDisplay.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (event) => {
            parseSRT(event.target.result);
            checkResumeStatus();
        };
        reader.readAsText(file);
    }
});

// SRT ကို ခွဲခြမ်းစိတ်ဖြာခြင်း (ID, Time, Text)
function parseSRT(data) {
    const blocks = data.replace(/\r/g, '').split('\n\n').filter(block => block.trim() !== '');
    srtBlocks = blocks.map(block => {
        const lines = block.split('\n');
        return {
            id: lines[0],
            time: lines[1],
            text: lines.slice(2).join('\n')
        };
    });
    translatedBlocks = new Array(srtBlocks.length).fill(null);
}

// Resume လုပ်နိုင်ရန် စစ်ဆေးခြင်း
function checkResumeStatus() {
    const savedData = localStorage.getItem('hazel_srt_progress');
    if (savedData) {
        const parsedData = JSON.parse(savedData);
        if (parsedData.total === srtBlocks.length) {
            translatedBlocks = parsedData.translated;
            const completed = translatedBlocks.filter(t => t !== null).length;
            updateProgress(completed, srtBlocks.length);
            if (completed > 0 && completed < srtBlocks.length) {
                resumeBtn.style.display = 'inline-flex';
                statusText.textContent = "Previous progress found. You can resume.";
            } else if (completed === srtBlocks.length) {
                finishTranslation();
            }
        } else {
            localStorage.removeItem('hazel_srt_progress');
        }
    }
}

function saveProgress() {
    localStorage.setItem('hazel_srt_progress', JSON.stringify({
        total: srtBlocks.length,
        translated: translatedBlocks
    }));
}

startBtn.addEventListener('click', () => startProcess(false));
resumeBtn.addEventListener('click', () => startProcess(true));

async function startProcess(isResume) {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) return alert('Please enter Gemini API Key!');
    if (srtBlocks.length === 0) return alert('Please upload an SRT file!');

    if (!isResume) {
        translatedBlocks = new Array(srtBlocks.length).fill(null);
        localStorage.removeItem('hazel_srt_progress');
    }

    isTranslating = true;
    startBtn.disabled = true;
    resumeBtn.style.display = 'none';

    for (let i = 0; i < srtBlocks.length; i += CHUNK_SIZE) {
        if (!isTranslating) break;

        // Skip already translated chunks
        if (translatedBlocks[i] !== null) continue;

        const chunk = srtBlocks.slice(i, i + CHUNK_SIZE);
        const textToTranslate = chunk.map(b => b.text.replace(/\n/g, ' ')).join(' ||| ');

        statusText.textContent = `Translating block ${i + 1} to ${Math.min(i + CHUNK_SIZE, srtBlocks.length)}...`;
        
        try {
            const translatedText = await translateWithGemini(textToTranslate, apiKey);
            const translatedArray = translatedText.split('|||').map(t => t.trim());

            if (translatedArray.length === chunk.length) {
                for (let j = 0; j < chunk.length; j++) {
                    translatedBlocks[i + j] = translatedArray[j];
                }
                saveProgress();
                updateProgress(i + chunk.length, srtBlocks.length);
            } else {
                throw new Error("Translation mismatch count. Retrying...");
                // API Limit သို့မဟုတ် Error ကြောင့် line အရေအတွက်မကိုက်လျှင် ရပ်မည်။
            }
        } catch (error) {
            console.error(error);
            statusText.textContent = `Error: Connection lost or API limit. Paused.`;
            isTranslating = false;
            startBtn.disabled = false;
            resumeBtn.style.display = 'inline-flex';
            break;
        }

        // API Limit မထိအောင် ၁ စက္ကန့် နားမည်
        await new Promise(r => setTimeout(r, 1000));
    }

    if (translatedBlocks.filter(t => t !== null).length === srtBlocks.length) {
        finishTranslation();
    }
}

// Gemini API သို့ ပို့ဆောင်ခြင်း
async function translateWithGemini(text, apiKey) {
    const prompt = `Translate the following English subtitles to strictly natural Myanmar (Burmese) language. The subtitles are separated by " ||| ". You MUST return the translation strictly separated by " ||| " in the exact same quantity. Do not add any extra text, notes, or explanations. Just the translated text. \n\nInput:\n${text}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) throw new Error('API Request Failed');
    
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
    statusText.textContent = "Translation Complete!";
    startBtn.disabled = false;
    startBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Restart';
    downloadBtn.disabled = false;
    copyBtn.disabled = false;
}

// SRT အနေဖြင့် ပြန်လည်တည်ဆောက်ခြင်း
function generateFinalSRT() {
    let finalSrt = '';
    for (let i = 0; i < srtBlocks.length; i++) {
        finalSrt += `${srtBlocks[i].id}\n`;
        finalSrt += `${srtBlocks[i].time}\n`;
        // Error မဖြစ်အောင် မူရင်းစာသားနေရာမှာ ဘာသာပြန်စာသားကို အတိအကျအစားထိုးသည်
        finalSrt += `${translatedBlocks[i] ? translatedBlocks[i] : srtBlocks[i].text}\n\n`;
    }
    return finalSrt;
}

downloadBtn.addEventListener('click', () => {
    const srtContent = generateFinalSRT();
    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Hazel_Translated_${fileNameDisplay.textContent}`;
    a.click();
});

copyBtn.addEventListener('click', () => {
    const srtContent = generateFinalSRT();
    navigator.clipboard.writeText(srtContent).then(() => {
        alert('SRT Copied to clipboard!');
    });
});
