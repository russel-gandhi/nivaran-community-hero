# Nivaran - Hyperlocal Civic & Building Issue Resolver

Nivaran is an agentic, real-time hyperlocal civic routing desk designed for Indian residents. It automatically routes, verifies, and resolves civic and building issues using Gemini AI, gamification, and community-driven initiatives.

## 🚀 Features

### 👥 Role-Based System
* **Citizen Mode**: Report issues, track status, organize community fixes, and earn XP.
* **Manager Mode**: Review, moderate, and resolve reported issues.

### 🔐 Authentication
* Sign in via Google Account.
* Sign up and sign in using Email & Password.

### 📝 Issue Reporting & Routing
* **Hierarchical Tiers**: Report issues at the Flat, Common Area, or Public tier.
* **Evidence Upload**: Submit photos, videos, or audio to back up your report.

### 🤖 AI-Powered Issue Verification
* **Gemini AI Integration**: Automatically verifies the validity of an issue based on the uploaded evidence (photo/video) using the `@google/genai` SDK.
* **Confidence Scoring**: Issues are tagged with AI confidence scores, reducing false reports and spam.

### 🗺️ Interactive Public Map & Proximity Alerts
* **Live Issue Tracking**: Browse anonymous public street complaints on a real-time interactive map.
* **Progressive Web App (PWA)**: Installable app with offline support.
* **Proximity Push Notifications**: Utilizing Firebase Cloud Messaging (FCM) and Service Workers, citizens receive push notifications (with distinct vibration patterns) asking "Is it still a problem?" when they physically approach an open issue in the real world. *(Note: This requires recent location sharing and is not continuous background tracking).*

### 🛠️ Community Fix Initiative
* **Organize & Collaborate**: Citizens can join "Community Fix Initiatives" for safe-category issues (e.g., Garbage, Cleanliness, Animal issues).
* **"After" Video Verification**: Once fixed, users upload an "After" video. The Gemini AI verifies that the issue is no longer present.
* **Bonus XP & Rewards**: Successfully verified community fixes reward participants with bonus points.

### 🔔 Real-Time Community Updates
* **Live Toasts**: When any issue is resolved, a real-time celebratory toast is broadcasted to all citizens currently online in the app using Firestore listeners (no page refresh required).

### 🏆 Gamification & Leaderboard
* Earn points (XP) for reporting valid issues, confirming others' reports, and participating in Community Fix Initiatives.
* Climb the leaderboard and earn civic badges.

## 💻 Tech Stack

* **Frontend**: React 19, Vite, Tailwind CSS, Lucide React (Icons), Framer Motion (Animations).
* **Backend**: Express.js, Node.js.
* **Database & Auth**: Firebase Firestore (Real-time NoSQL), Firebase Auth.
* **Notifications**: Firebase Cloud Messaging (FCM), Service Workers.
* **AI Engine**: Google GenAI (`@google/genai`).

## ⚙️ Getting Started

### Prerequisites
* Node.js
* Firebase Project Setup
* Gemini API Key

### Installation

1. **Clone the repository** (if applicable) or setup the environment.
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Environment Variables**:
   Create a `.env` file based on `.env.example` and add your Gemini API Key.
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
4. **Firebase Configuration**:
   Ensure `firebase-applet-config.json` is properly populated with your Firebase project credentials.
5. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   The app will start at `http://localhost:3000`.

### Production Build
To create a production bundle:
```bash
npm run build
```
To start the production server:
```bash
npm run start
```

## 📱 Progressive Web App (PWA)
Nivaran is a fully configured PWA. To test proximity notifications:
1. Allow Location and Notification permissions in your browser.
2. Ensure the app is served over HTTPS (or localhost).
3. The background service worker (`firebase-messaging-sw.js`) handles foreground and background push events.

