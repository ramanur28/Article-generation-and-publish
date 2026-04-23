# WordPress Article Automator

An AI-powered application that generates SEO-optimized long-form articles using Gemini AI and automatically schedules them to your WordPress website with full support for SiteSEO (SEOPress).

## 🚀 Features

- **Long-Form Content**: Automatically splits generation into multiple stages to achieve 1,000+ word articles.
- **SEO Metadata**: Generates meta titles, descriptions, and focus keyphrases.
- **SiteSEO Integration**: Directly populates SiteSEO plugin fields (`_siteseo_titles_title`, `_siteseo_titles_desc`, `_siteseo_analysis_target_kw`).
- **Category & Tag Resolution**: Automatically finds or creates WordPress categories and tags by name.
- **Scheduling**: Set a specific future date and time for publication.
- **Interactive Preview**: Edit the AI's output, metadata, and focus keywords before publishing.

---

## 🛠️ Prerequisites

1. **WordPress Site**: 
   - Must have **Application Passwords** enabled (Standard in WordPress 5.6+).
   - [Optional but recommended] **SiteSEO (SEOPress)** plugin installed for SEO meta support.
2. **Gemini API Key**: 
   - Obtain a key from the [Google AI Studio](https://aistudio.google.com/).
3. **Node.js**: 
   - Version 18.x or higher.

---

## 💻 Local Setup & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Start Development Server
This runs the full-stack app (Express backend proxy + Vite frontend).
```bash
npm run dev
```
The app will be available at `http://localhost:3000`.

---

## 📝 WordPress Configuration

### Getting an Application Password
1. Log in to your WordPress Admin dashboard.
2. Go to **Users > Profile**.
3. Scroll down to the **Application Passwords** section.
4. Name your application (e.g., "Article Automator") and click **Add New Application Password**.
5. **Copy the password immediately** (it looks like `xxxx xxxx xxxx xxxx`).

---

## 🚢 Deployment

### Build for Production
```bash
npm run build
```
This generates the static frontend in `/dist` and cleans the project.

### Run in Production
1. Ensure your hosting environment has Node.js installed.
2. Set the `GEMINI_API_KEY` environment variable.
3. Start the server using:
```bash
npm start
```

### 🐋 Docker Deployment
This app can be containerized using the provided `Dockerfile`.

1. **Build the Docker Image**:
   ```bash
   docker build -t wp-article-automator .
   ```

2. **Run the Container**:
   ```bash
   docker run -p 3000:3000 \
     -e GEMINI_API_KEY=your_gemini_api_key_here \
     wp-article-automator
   ```

### 🛠️ Docker Compose (Recommended)
The easiest way to run the application is using Docker Compose.

1. **Create/Update your `.env` file**:
   Ensure `GEMINI_API_KEY` is set.

2. **Start the application**:
   ```bash
   docker compose up -d
   ```
   The app will be available at `http://localhost:3000`.

3. **Stop the application**:
   ```bash
   docker compose down
   ```

### Self-Hosting (Node.js/Cloud)
The application includes a built-in Express server (`server.ts`) that serves the frontend and handles the WordPress API proxy. It is designed to be easily containerized for services like **Google Cloud Run**, **Render**, or **DigitalOcean**.

---

## ⚠️ Security Notes
- **App Passwords**: Never use your main WordPress admin password. Always use an Application Password which can be revoked at any time.
- **Proxy**: The included Express proxy handles the `Basic Auth` header on the server side, so your credentials are never exposed in the browser network tab to external parties.

## 📄 License
SPDX-License-Identifier: Apache-2.0
