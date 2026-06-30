# Nivaran - Hyperlocal Civic & Building Issue Resolver

Nivaran is an agentic, real-time hyperlocal civic routing desk designed for Indian residents. It automatically routes, verifies, and resolves civic and building issues using Gemini AI, gamification, and community-driven initiatives.

---

## 🚀 Key Features

### 👥 Role-Based System
* **Citizen Mode**: Report issues, track status, organize community fixes, earn points (XP), and claim rewards.
* **Manager Mode**: Review, moderate, route, and resolve reported issues with detailed logs.

### 🔐 Multi-Mode Authentication
* **Google Account**: Fast sign-in utilizing Google Identity Platform.
* **Email & Password**: Standard credential authentication.
* **Demo Accounts**: Instant single-click authentication for fast testing of various roles (Citizen, Manager, Admin).

### 🎙️ Multilingual Voice Note Reporting & Auto-Translation
* **Native Language Input**: Citizens can record voice notes directly in their preferred language (e.g., Hindi, Marathi, Bengali) instead of typing description texts.
* **Multimodal Gemini Pipeline**: The raw audio is processed directly by the native `gemini-3.5-flash` model to:
  1. Transcribe the audio precisely in its original language.
  2. Translate the description into high-quality English for storage.
  3. Classify and auto-align it to the correct predefined category, sub-tag, and tier.
* **Interactive Verification Dialogues**: If critical details are missing (e.g., category or location), Gemini automatically generates a polite follow-up question in the *same* language (Hindi/Marathi) before finalizing the report. The user's reply is translated and seamlessly combined with the original description.
* **Persistent Audio Playback**: The original audio file is preserved and remains attached to the issue report for reference by citizens and maintenance teams.

### 🤖 AI-Powered Issue Verification
* **Evidence Upload**: Submit photos, videos, or audio to back up your report.
* **Computer Vision Validation**: Gemini AI automatically verifies the validity of the uploaded media to flag potential false reports, duplicate submissions, or unrelated images.
* **Routing & Confidence Scoring**: Generates live confidence ratings and automatically routes tickets to appropriate channels.

### 🎁 Citizen Rewards & Coupons
* **Gamified Milestones**: Earn points (XP) for reporting valid issues, confirming others' reports, or resolving community problems.
* **Unlockable Rewards**: Cross point thresholds on the leaderboard to unlock local mock coupons:
  * 🟢 **100 XP**: 10% OFF Fresh Organic Produce at GreenGrocer stores.
  * 🟡 **250 XP**: Free Ginger Cutting Chai at ChaiPoint Corner.
  * 🔵 **500 XP**: ₹200 OFF Home Cleaning and sanitization services from UrbanCare.
* **Secure UI-Only Redemption**: Smooth animations with secure reveal mechanisms and single-click coupon code copying.

### 🗺️ Interactive Public Map & Proximity Alerts
* **Live Spatial Tracker**: Browse anonymous public street complaints on a real-time interactive map.
* **Proximity Push Notifications**: Utilizing Firebase Cloud Messaging (FCM) and Service Workers, citizens receive push notifications asking *"Is this still a problem?"* with customized physical vibration patterns when they walk near an active public issue.

### 🛠️ Community Fix Initiative
* **Organize & Collaborate**: Citizens can join "Community Fix Initiatives" for safe categories (e.g., Garbage, Cleanliness, Animal issues).
* **"After" Video Verification**: Upload an "After" video. Gemini AI compares it against the original report to verify that the issue has been completely resolved.
* **Celebratory Broadcasts**: Once resolved, celebratory real-time broadcast toasts are pushed to all online citizens in the application.

---

## 💻 Tech Stack

* **Frontend**: React 19, Vite, Tailwind CSS, Lucide React (Icons), Framer Motion (Animations).
* **Backend**: Express.js, Node.js (via `tsx` in development).
* **Database & Auth**: Firebase Firestore (Real-time NoSQL), Firebase Auth.
* **AI Engine**: Google GenAI SDK (`@google/genai` utilizing the powerful `gemini-3.5-flash` model).

---

## ⚙️ Getting Started

### Prerequisites
* Node.js (v18+)
* Firebase Project Setup (Firestore, Auth, rules)
* Gemini API Key

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Environment Variables**:
   Add your server-side Gemini API key in your environment settings (or a local `.env` file):
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
3. **Firebase Configuration**:
   Ensure `firebase-applet-config.json` is properly populated with your Firebase project credentials.

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   The app will start at `http://localhost:3000`.

### Production Build
To bundle both the compiled React frontend assets and the bundled CommonJS backend server:
```bash
npm run build
```
To run the production application:
```bash
npm run start
```
