import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import { google } from 'googleapis';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up larger limit for base64 uploads (photos/audio)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Check if Gemini API Key is present
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.warn('⚠️ GEMINI_API_KEY environment variable is not defined! AI features will fail.');
}

const ai = new GoogleGenAI({ apiKey: geminiApiKey || 'DUMMY_KEY' });

// Help parse base64 data URLs
function parseBase64DataUrl(dataUrl: string) {
  if (!dataUrl) return null;
  const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return {
      mimeType: matches[1],
      data: matches[2]
    };
  }
  return null;
}

// 1. Out-of-Scope and Emergency Check (Step 3)
app.post('/api/check-scope', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || description.trim() === '') {
      return res.json({ status: 'valid' });
    }

    // Safety bypass: urgent keyword check
    const lowerDesc = description.toLowerCase();
    const urgentKeywords = [
      'fire', 'crime', 'murder', 'police', 'ambulance', 'heart attack', 'emergency', 'dying', 'suicide', 'kill',
      'bleeding', 'accident', 'theft', 'robbery', 'hostage', 'abuse', 'ongoing assault', 'assault'
    ];
    
    const hasUrgentKeyword = urgentKeywords.some(keyword => {
      // Basic boundary check
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(lowerDesc);
    });

    if (hasUrgentKeyword) {
      return res.json({
        status: 'emergency',
        redirect: 'This sounds urgent. Please contact 112 right away.'
      });
    }

    // Call Gemini to classify safety and scope
    const prompt = `You are a triage classifier for "Nivaran", a hyperlocal civic and building issue resolver app.
Analyze the user's report description and decide if it falls into one of these categories:
1. EMERGENCY: Suggests fire, an ongoing crime, a medical emergency, active physical danger, or a personal crisis.
2. OUT_OF_SCOPE: About an individual driver or vehicle's behavior, a personal dispute with a neighbor, a landlord/billing dispute, naming/defaming a specific individual, political content, or a general informational question.
3. VALID: Any legitimate building/civic issue (e.g. leaking plumbing, broken streetlights, broken lift, potholes, garbage, water drainage, construction noise, private flat interior issues like broken door locks or appliances, etc.).

Your output must be strictly JSON format conforming to this typescript interface:
{
  status: 'emergency' | 'out_of_scope' | 'valid',
  redirectMessage?: string // A short polite message indicating who to contact or why it was bounced
}

User description: "${description}"

Ensure you return ONLY JSON. No markdown wrappers except possibly \`\`\`json.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text || '{}';
    // Clean markdown if any
    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanText);

    if (result.status === 'emergency') {
      return res.json({
        status: 'emergency',
        redirect: result.redirectMessage || 'This sounds urgent. Please contact 112 right away.'
      });
    } else if (result.status === 'out_of_scope') {
      return res.json({
        status: 'out_of_scope',
        redirect: result.redirectMessage || 'For this type of issue, please contact local traffic police or relevant private parties.'
      });
    }

    return res.json({ status: 'valid' });
  } catch (error: any) {
    console.warn('Check-scope API fallback triggered due to AI error:', error.message || error);
    // Graceful fallback to valid if Gemini fails to keep user flow going, or do a strict check
    res.json({ status: 'valid' });
  }
});

// 2. Multimodal Verification Agent (Step 5)
app.post('/api/verify-evidence', async (req, res) => {
  try {
    const { category, subtag, description, evidenceUrl, evidenceType, verificationMode } = req.body;
    const isResolution = verificationMode === 'resolution';

    if (!evidenceUrl) {
      return res.status(400).json({ error: 'Evidence URL/base64 is required.' });
    }

    const parsedEvidence = parseBase64DataUrl(evidenceUrl);
    if (!parsedEvidence) {
      return res.status(400).json({ error: 'Invalid evidence format (must be base64 data URL).' });
    }

    const contents: any[] = [];
    
    // Add textual context
    let textPrompt = '';
    const isSimulated = parsedEvidence.data === 'UklGRi4AAABXQVZFRm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' || parsedEvidence.data.length < 100;

    if (evidenceType === 'audio' || parsedEvidence.mimeType.startsWith('audio/')) {
      if (isResolution) {
        textPrompt = `You are a professional acoustic forensic verification agent for "Nivaran".
The citizen has submitted an audio clip proving that a noise grievance has been RESOLVED.
Original Category: "${category}"
Original Subtag: "${subtag}"
Original Description: "${description || 'No description provided.'}"

${isSimulated ? `⚠️ METADATA NOTE: This is a simulated/dummy audio sample. Assume the audio confirms the noise is GONE based on standard quiet ambient noise.` : ''}

CRITICAL PROTOCOLS:
Analyze if the audio proves the noise is absent.
If it is absent (normal room silence), set is_valid_issue=true, confidence>60, rejection_reason=null.
If the noise is still present, set is_valid_issue=false, confidence>60, rejection_reason="Noise is still audible."
`;
      } else {
        textPrompt = `You are a professional acoustic forensic verification agent for "Nivaran", a smart hyperlocal civic/building grievance platform.
The citizen has submitted a noise grievance under:
- Category: "${category}"
- Subtag: "${subtag}"
- Description: "${description || 'No description provided.'}"

${isSimulated ? `⚠️ METADATA NOTE: This is a simulated/dummy audio sample. Since this is an interactive simulation, you must perform a simulated acoustic review of the sound described in the user's description.
- If their description mentions real noise nuisances (e.g., active drilling, hammering, loud construction, grinding machinery), accept the claim, simulating that you detected these specific frequency and amplitude peaks in the audio file.
- If their description mentions typical quiet room backgrounds, complete silence, or faint domestic sounds (e.g., "very quiet", "just standard ticking of my clock", "faint fan hum"), reject the claim.
- Explicitly state in your reasoning that you conducted a simulated acoustic analysis on the described soundscape.` : ''}

CRITICAL ACOUSTIC VERIFICATION PROTOCOLS:
1. DETECTED SOUND CLASSIFICATION:
   - "NORMAL ROOM BACKGROUND NOISE": This includes complete silence, quiet breathing, faint breeze, domestic fan/AC whirring, distant ticking of a clock, soft page-turning, light keyboard typing, or occasional shuffling. These are ordinary, non-actionable sounds of human habitation and MUST NOT be accepted as grievances.
   - "ACTIVE CONSTRUCTION / NUISANCE NOISE": Heavy machinery, concrete drill, hammer impacts, electric circular saw, stone/tile grinding, metal clanging, loud generator hums, shouting, loud high-bass music, or persistent thumping.

2. LOGICAL RULESET FOR DETERMINATION:
   - If the audio contains ONLY Normal Room Background Noise but the citizen claims there is construction drilling, grinding, or hammering:
     * Set "is_valid_issue" to false.
     * Set "confidence" to 90-100%.
     * Set "rejection_reason" to: "Our acoustic validation detected only ambient room silence or normal domestic sounds (e.g., quiet room hum, light whispering). No active drilling, hammering, or construction noises were present in the recording. Please record again when the noise nuisance is actively occurring."
     * Keep severity_hint at 1.
   - If the audio contains distinct, audible Active Construction / Nuisance Noise aligning with the citizen's description:
     * Set "is_valid_issue" to true.
     * Set "confidence" to 85-100% depending on clarity.
     * Set "detected_subtag" to the subtag. If the subtag is slightly mismatched (e.g., they claimed "Drilling" but you hear "Loud Music"), auto-correct the "detected_subtag" to the correct noise      * Set "rejection_reason" to null.
     * Select "severity_hint" from 1 to 5 (e.g., continuous drilling/sawing = 4 or 5, occasional banging = 2 or 3).`;
      }
    } else if (evidenceType === 'video' || parsedEvidence.mimeType.startsWith('video/')) {
      if (isResolution) {
        textPrompt = `You are a professional video forensic verification agent for "Nivaran".
The citizen has submitted a video proving that an issue has been RESOLVED.
Original Category: "${category}"
Original Subtag: "${subtag}"
Original Description: "${description || 'No description provided.'}"

CRITICAL PROTOCOLS:
Analyze if the video proves the issue is fixed (e.g., clean street, patched pothole).
If it is fixed, set is_valid_issue=true, confidence>60, rejection_reason=null.
If the issue is still clearly visible, set is_valid_issue=false, confidence>60, rejection_reason="Issue is still visible."
`;
      } else {
        textPrompt = `You are a professional video forensic verification agent for "Nivaran", a smart hyperlocal civic/building grievance platform.
The citizen has submitted video evidence under:
- Category: "${category}"tegory}"
- Subtag: "${subtag}"
- Description: "${description || 'No description provided.'}"

CRITICAL VIDEO VERIFICATION PROTOCOLS:
1. DETECTED VISUAL FAILURE CLASSIFICATION:
   - "DYNAMIC FAILURES / HAZARDS": Moving elements, active running/spraying water, flickering electrical sparks, malfunctioning elevator doors, active traffic congestion, people carrying out unauthorized activities, or active structural degradation.
   - "STATIC HAZARDS": Severe physical degradation, structural cracks, broken fixtures, overflowing waste containers.
   - "FRAUDULENT / SPAM EVIDENCE": Completely dark/blank screen, a simple selfie, photos of family pets, random scenery (like a nice garden or sky), general internet memes, or an entirely clean room or floor with no issues.

2. LOGICAL RULESET FOR DETERMINATION:
   - If the video shows zero visual failure, is completely black, blank, blurred, or shows unrelated subjects (such as a selfie or a pet):
     * Set "is_valid_issue" to false.
     * Set "confidence" to 95-100%.
     * Set "rejection_reason" to: "The video evidence provided does not contain any visible hazard, structural failure, or civic issue matching the report. It appears to be a blank screen, selfie, or unrelated capture. Please capture a clear video clip showing the active issue."
     * Keep severity_hint at 1.
   - If the video shows a real issue but the category/subtag is slightly mismatched (e.g., reported "road pothole" but video shows "overflowing sewage"):
     * Set "is_valid_issue" to true.
     * Set "confidence" to 80-100%.
     * Set "detected_subtag" to the aligned correct subtag.
     * Set "rejection_reason" to null.
     * Select "severity_hint" from 1 to 5 (e.g., active water flooding = 4 or 5, minor flickering = 2).
   - If the video accurately captures the reported issue:
     * Set "is_valid_issue" to true.
     * Set "confidence" to 85-100%.
     * Set "detected_subtag" to the original subtag.
     * Set "rejection_reason" to null.
     * Set "severity_hint" from 1 to 5 based on the visual magnitude of the hazard.`;
      }
    } else {
      if (isResolution) {
        textPrompt = `You are a professional visual inspector and forensic verification agent for "Nivaran".
The citizen has submitted a photo proving that an issue has been RESOLVED.
Original Category: "${category}"
Original Subtag: "${subtag}"
Original Description: "${description || 'No description provided.'}"

CRITICAL PROTOCOLS:
Analyze if the photo proves the issue is fixed (e.g., clean street, patched pothole).
If it is fixed, set is_valid_issue=true, confidence>60, rejection_reason=null.
If the issue is still clearly visible, set is_valid_issue=false, confidence>60, rejection_reason="Issue is still visible in the photo."
`;
      } else {
        textPrompt = `You are a professional visual inspector and forensic verification agent for "Nivaran", a smart hyperlocal civic/building grievance platform.
The citizen has submitted photo evidence under:
- Category: "${category}"
- Subtag: "${subtag}"
- Description: "${description || 'No description provided.'}"

CRITICAL PHOTO VERIFICATION PROTOCOLS:
1. DETECTED PHOTO FAILURE CLASSIFICATION:
   - "LEGITIMATE CIVIL/BUILDING ISSUES": Potholes, asphalt damage, water seepage, wet damp patches, mold, peeling plaster, structural cracks, broken wiring, rusted light poles, leaking plumbing fixtures, overflowing trash dumps.
   - "FRAUDULENT / SPAM / UNRELATED": Selfies, domestic animals/pets, internet memes, general landscape photos, clean/well-maintained walls or floors with zero defects, or completely blurry/out-of-focus pictures where nothing is identifiable.

2. LOGICAL RULESET FOR DETERMINATION:
   - If the photo shows no visible issue, or is completely unrelated, blurry, or spam:
     * Set "is_valid_issue" to false.
     * Set "confidence" to 95-100%.
     * Set "rejection_reason" to: "The photo evidence provided does not contain any visible structural damage, civil hazard, or municipal failure matching the description. Please upload a clear, focused photo showing the issue clearly."
     * Keep severity_hint at 1.
   - If the photo shows a real civic/structural issue but under a different subtag (e.g., reported "peeling paint" but photo shows a "deep structural beam crack"):
     * Set "is_valid_issue" to true.
     * Set "confidence" to 80-100%.
     * Set "detected_subtag" to the correct matching subtag to auto-align the report.
     * Set "rejection_reason" to null.
     * Set "severity_hint" from 1 to 5 based on risk.
   - If the photo perfectly substantiates the reported issue:
     * Set "is_valid_issue" to true.
     * Set "confidence" to 85-100%.
     * Set "detected_subtag" to the original subtag.
     * Set "rejection_reason" to null.
     * Set "severity_hint" from 1 to 5 (e.g., major wall seepage with structural damage = 4 or 5, minor peeling paint = 1 or 2).`;
      }
    }

    if (isResolution) {
      textPrompt += `\n\nOUTPUT FORMAT SPECIFICATION:
You must respond with raw JSON matching this TypeScript structure:
{
  "is_valid_issue": boolean,
  "confidence": number, // integer 0-100
  "detected_subtag": "string",
  "severity_hint": number, // 1 to 5
  "reasoning": "Explain your analysis",
  "rejection_reason": "string describing why it was rejected, or null if accepted"
}

Ensure you return ONLY the valid raw JSON. Do not include markdown codeblocks or wrap in \`\`\`json.`;
    } else {
      textPrompt += `\n\nOUTPUT FORMAT SPECIFICATION:
You must respond with raw JSON matching this TypeScript structure:
{
  "is_valid_issue": boolean,
  "confidence": number, // integer 0-100
  "detected_subtag": "string",
  "severity_hint": number, // 1 to 5
  "reasoning": "Provide an extremely rigorous, visual inspection analysis breakdown including: 1) Structural & Damage indicators observed, 2) Hazard scale and impact estimation, and 3) Aligned subtag confirmation. Summarize it always in less than 100 words.",
  "rejection_reason": "string describing why it was rejected, or null if accepted"
}

Ensure you return ONLY the valid raw JSON. Do not include markdown codeblocks or wrap in \`\`\`json.`;
    }

    const contentsParts = [
      { text: textPrompt },
      {
        inlineData: {
          data: parsedEvidence.data,
          mimeType: parsedEvidence.mimeType
        }
      }
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: { parts: contentsParts },
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text || '{}';
    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanText);

    return res.json(result);
  } catch (error: any) {
    console.warn('Error in verify-evidence API:', error.message || error);
    // Return a structured error response with status 200 so the client fail-opens gracefully
    res.status(200).json({
      is_valid_issue: true, // Fail-open for demo if Gemini fails completely
      confidence: 80,
      detected_subtag: req.body.subtag,
      severity_hint: 3,
      reasoning: 'Server-side verification bypassed due to configuration error, accepted automatically for demo purposes.',
      rejection_reason: null
    });
  }
});

// 3. Routing Agent (Step 8)
app.post('/api/route-report', (req, res) => {
  const { categoryId, categoryName, subtag, tier } = req.body;

  const referenceId = 'NIV-' + Math.floor(100000 + Math.random() * 900000);

  if (tier === 'flat' || tier === 'common_area') {
    return res.json({
      routedTo: 'building_manager',
      referenceId,
      deptName: 'Building Management Office',
      message: 'Ticket successfully created and routed to Building Management.'
    });
  }

  // Public street routing map
  let deptName = 'General Civic Grievance Cell';
  const cat = (categoryName || '').toLowerCase();

  if (cat.includes('road')) {
    deptName = 'Public Works Department (PWD)';
  } else if (cat.includes('streetlight') || cat.includes('electrical')) {
    deptName = 'Municipal Electricity & Lighting Board';
  } else if (cat.includes('garbage') || cat.includes('waste')) {
    deptName = 'Sanitation & Solid Waste Management Dept';
  } else if (cat.includes('water') || cat.includes('drainage')) {
    deptName = 'Water Supply & Sewerage Board';
  } else if (cat.includes('construction') || cat.includes('nuisance')) {
    deptName = 'Urban Pollution & Environmental Control Division';
  } else if (cat.includes('junction') || cat.includes('unsafe')) {
    deptName = 'Traffic Engineering & Road Safety Department';
  } else if (cat.includes('stray') || cat.includes('animal')) {
    deptName = 'Animal Welfare Board & Veterinary Services Division';
  }

  return res.json({
    routedTo: 'government_dept',
    referenceId,
    deptName,
    message: `Civic issue automatically routed and formal complaint filed with simulated department: ${deptName}.`
  });
});

// Process Voice Note Description (Hindi, Marathi, etc.) using Gemini
app.post('/api/process-voice-description', async (req, res) => {
  try {
    const { voiceAudio, categories, simulatedLanguage } = req.body;
    if (!voiceAudio) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    const parsedAudio = parseBase64DataUrl(voiceAudio);
    if (!parsedAudio) {
      return res.status(400).json({ error: 'Invalid audio format' });
    }

    const isSimulated = parsedAudio.data === 'UklGRi4AAABXQVZFRm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' || parsedAudio.data.length < 100 || voiceAudio.includes('simulated-audio');

    if (isSimulated) {
      // Return high-quality localized simulations based on language selection
      if (simulatedLanguage === 'mr') {
        // Marathi plumbing leak with everything detected
        return res.json({
          originalTranscription: "आमच्या इमारतीमध्ये पाण्याच्या पाईप फुटली आहे आणि खूप पाणी वाहत आहे.",
          englishTranslation: "A water pipe has burst in our building and a lot of water is flowing.",
          detectedTier: "common_area",
          detectedCategoryId: "common-plumbing",
          detectedCategoryName: "Common plumbing/water tank",
          detectedSubtag: "Main line leak or low water pressure",
          missingDetails: "none",
          followUpQuestion: null
        });
      } else if (simulatedLanguage === 'hi_vague') {
        // Hindi vague - triggers the follow-up question flow!
        return res.json({
          originalTranscription: "भैया कुछ खराब हो गया है, जल्दी आओ ठीक करने के लिए।",
          englishTranslation: "Brother, something is broken, please come quickly to fix it.",
          detectedTier: null,
          detectedCategoryId: null,
          detectedCategoryName: null,
          detectedSubtag: null,
          missingDetails: "category",
          followUpQuestion: "नमस्ते! क्या आप कृपया बता सकते हैं कि कौन सी चीज़ खराब हुई है? (जैसे नल बहना, लाइट खराब होना या लिफ्ट अटकना) ताकि हम सही टीम भेज सकें।"
        });
      } else {
        // Default Hindi (Pothole/Road) - Fully detected
        return res.json({
          originalTranscription: "सेक्टर 62 की मुख्य सड़क पर बहुत बड़ा गड्ढा हो गया है, पानी भर गया है और गाड़ियां गिर रही हैं।",
          englishTranslation: "There is a very large pothole on the main road of Sector 62, it is filled with water and vehicles are falling.",
          detectedTier: "public",
          detectedCategoryId: "public-roads",
          detectedCategoryName: "Roads",
          detectedSubtag: "Potholes or damaged pavement",
          missingDetails: "none",
          followUpQuestion: null
        });
      }
    }

    // Real audio processing with gemini-3.5-flash
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: parsedAudio.mimeType,
            data: parsedAudio.data
          }
        },
        {
          text: `You are a multilingual AI assistant for a civic and building issue resolver app called "Nivaran".
The attached audio clip is a citizen's voice note describing their issue in their native language (e.g. Hindi, Marathi, English, etc.).

Analyze the audio clip and perform these tasks:
1. Transcribe the audio precisely in its original language (e.g. Hindi, Marathi, Bengali, English).
2. Translate the description into English.
3. Match it to one of our predefined categories and subtags:
${JSON.stringify(categories)}

If the description lacks enough details to map to any Category or sub-tag, then:
- set 'missingDetails' to "category" or "subtag".
- formulate ONE short, polite follow-up question in the SAME language as the original voice note asking them for clarification (e.g. in Hindi or Marathi).
- otherwise, if everything is clear, set 'missingDetails' to "none" and 'followUpQuestion' to null.

Output must be strictly raw JSON format matching this schema:
{
  "originalTranscription": "string",
  "englishTranslation": "string",
  "detectedCategoryId": "string | null",
  "detectedCategoryName": "string | null",
  "detectedSubtag": "string | null",
  "missingDetails": "category" | "subtag" | "none",
  "followUpQuestion": "string | null"
}

Do not include any markdown backticks or wrappers like \`\`\`json.`
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text || '{}';
    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanText);
    return res.json(result);

  } catch (error: any) {
    console.error('Error in process-voice-description API:', error);
    res.status(500).json({ error: error.message || 'Internal server error processing audio' });
  }
});

// Process Voice Follow-Up
app.post('/api/process-voice-followup', async (req, res) => {
  try {
    const { originalTranslation, followUpQuestion, userResponse, categories } = req.body;
    
    const prompt = `You are a multilingual AI assistant for "Nivaran".
The user originally reported an issue and we asked them a follow-up question in their language because some details were missing.

Original Description (English translation): "${originalTranslation}"
Follow-up Question asked: "${followUpQuestion}"
User's Answer: "${userResponse}"

Please:
1. Translate the user's answer into English.
2. Combine and refine the original description and the new answer into a single, cohesive English description that is clear and detailed for our maintenance teams.
3. Classify and match this refined description to one of our available categories:
${JSON.stringify(categories)}

Output strictly as a JSON object matching this schema:
{
  "refinedEnglishTranslation": "string", // complete, combined, clear description in English
  "detectedCategoryId": "string | null",
  "detectedCategoryName": "string | null",
  "detectedSubtag": "string | null"
}

Ensure you return ONLY JSON. Do not include markdown codeblocks or wrap in \`\`\`json.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text || '{}';
    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanText);
    return res.json(result);

  } catch (error: any) {
    console.error('Error in process-voice-followup:', error);
    res.status(500).json({ error: error.message || 'Internal server error processing follow-up' });
  }
});

// 4. Send Email Agent (Step 11 & Step 12)
app.post('/api/send-email', async (req, res) => {
  try {
    const { accessToken, to, subject, type, reportId, category, actionUrl } = req.body;
    
    if (!accessToken || !to) {
      return res.status(400).json({ error: 'Missing access token or recipient' });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth });

    let messageText = '';
    let messageHtml = '';

    if (type === 'resolved_confirmation') {
      messageText = `Your reported ${category} issue has been marked resolved — can you confirm it's actually fixed?\n\nPlease confirm: ${actionUrl}`;
      messageHtml = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Issue Resolution Confirmation</h2>
          <p>Your reported <strong>${category}</strong> issue has been marked resolved.</p>
          <p>Can you confirm it's actually fixed?</p>
          <a href="${actionUrl}&confirm=yes" style="display:inline-block; padding: 10px 20px; background: #16a34a; color: #fff; text-decoration: none; border-radius: 5px; margin-right: 10px;">Yes, it's fixed</a>
          <a href="${actionUrl}&confirm=no" style="display:inline-block; padding: 10px 20px; background: #dc2626; color: #fff; text-decoration: none; border-radius: 5px;">No, reopen it</a>
        </div>
      `;
    } else if (type === 'time_decay') {
      messageText = `Your reported ${category} issue has been open for a while. Is it still a problem?\n\nPlease confirm: ${actionUrl}`;
      messageHtml = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Issue Status Check</h2>
          <p>Your reported <strong>${category}</strong> issue has been open past the 5-day threshold with no resolution.</p>
          <p>Is it still a problem?</p>
          <a href="${actionUrl}&confirm=no" style="display:inline-block; padding: 10px 20px; background: #16a34a; color: #fff; text-decoration: none; border-radius: 5px; margin-right: 10px;">No, it's resolved</a>
          <a href="${actionUrl}&confirm=yes" style="display:inline-block; padding: 10px 20px; background: #dc2626; color: #fff; text-decoration: none; border-radius: 5px;">Yes, still a problem</a>
        </div>
      `;
    }

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      messageHtml,
    ];
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start Express server and integrate Vite middleware
async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite development server loaded as middleware');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Nivaran Server running on http://localhost:${PORT} (Production: ${process.env.NODE_ENV === 'production'})`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
