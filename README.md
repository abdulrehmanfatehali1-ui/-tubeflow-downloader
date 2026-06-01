# TubeFlow Ultimate - World-Class Multi-Platform Downloader

TubeFlow Ultimate is a premium, high-speed, and ultra-responsive multi-platform video and audio downloader. It features a stunning, state-of-the-art **glowing Glassmorphic UI** with automatic platform brand-color theme morphing (YouTube, Instagram, TikTok, Facebook, and Universal site groups) and a live in-page progress polling engine.

It is built as a **full-stack Python Flask application** powered by `yt-dlp` and `ffmpeg` (via `static-ffmpeg` and dynamic OS-level binaries).

---

## 🚀 How to Run Locally

1. **Clone or navigate to the directory**:
   ```bash
   cd youtube-downloader
   ```
2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Start the local server**:
   ```bash
   python app.py
   ```
4. Open **`http://localhost:5000`** in your browser.

---

## 📦 Uploading to GitHub

To upload this project to your own GitHub repository, open a terminal in this directory and execute:

```bash
# 1. Initialize local Git repository
git init

# 2. Stage all files
git add .

# 3. Create initial commit
git commit -m "Initial commit: TubeFlow Ultimate Downloader"

# 4. Link your remote GitHub repository
git remote add origin YOUR_GITHUB_REPO_URL

# 5. Rename primary branch to main and push
git branch -M main
git push -u origin main
```

---

## 🌐 Cloud Deployment Options (Important Information)

### ⚠️ Why Vercel is NOT Recommended for TubeFlow

Vercel is a serverless platform designed primarily for frontend pages (like Next.js or HTML/JS) and ephemeral serverless API functions. It has several strict constraints that make it **unsuitable** for video downloaders:
1. **Execution Timeouts**: Vercel has a strict **10 to 15-second execution timeout** on serverless functions. Since downloading large videos from YouTube/TikTok and merging them using `ffmpeg` can take 30 to 90 seconds, **Vercel will instantly crash with a Gateway Timeout (504)** on almost all download requests!
2. **Read-Only Filesystem**: Vercel runs inside read-only AWS Lambda containers. Merging high-resolution video and audio requires writing temporary files and executing `ffmpeg`, which is heavily restricted or blocks binary executions.
3. **Subprocess execution**: Launching background threads and running compiled subprocesses like `ffmpeg.exe`/`ffmpeg` often fails due to permissions inside serverless architectures.

---

### 🏆 Recommended Platforms for Deployment (Free & Easy)

To host TubeFlow in the cloud for free with full persistent support and `ffmpeg` merging, we highly recommend **Render.com**, **Railway.app**, or **Hugging Face Spaces** using the included **`Dockerfile`**.

#### 1. Render.com (Highly Recommended - Free & Fully Automated)
Render supports standard Dockerized Flask applications and persistent servers:
1. Push your code to a GitHub repository.
2. Sign up on **[Render.com](https://render.com/)** (Free).
3. Click **New +** and select **Web Service**.
4. Connect your GitHub repository.
5. In the settings:
   - **Runtime**: Select `Docker` (Render will automatically detect our `Dockerfile`!).
   - **Plan**: Select the `Free` tier.
6. Click **Deploy Web Service**. Render will automatically build the container, install `ffmpeg`, install Python, and deploy your downloader live!

#### 2. Railway.app (Excellent & Fast - Free Tier)
Railway is extremely fast and compiles our Docker container instantly:
1. Push your code to GitHub.
2. Connect your repository on **[Railway.app](https://railway.app/)**.
3. Railway will detect the `Dockerfile` and deploy the app immediately.

#### 3. Hugging Face Spaces (Free Hosting with Unlimited Runtimes)
Hugging Face offers free hosting for Docker containers:
1. Create an account on **[Hugging Face](https://huggingface.co/)**.
2. Create a new **Space**.
3. In the settings, select **SDK: Docker** (use blank/default template).
4. Clone the space locally or upload the TubeFlow files (including `Dockerfile` and `requirements.txt`) directly via their web interface.
5. Hugging Face will compile the container and host it free of charge!
