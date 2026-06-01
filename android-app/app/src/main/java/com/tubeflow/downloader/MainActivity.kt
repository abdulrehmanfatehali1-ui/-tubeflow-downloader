package com.tubeflow.downloader

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar

    // HuggingFace Spaces production URL - works independently without PC!
    private val APP_URL = "https://abdulrehmanfatehali1-tubeflow-downloader.hf.space"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        setupWebView();
        webView.loadUrl(APP_URL);
    }

    private fun setupWebView() {
        val settings = webView.settings
        
        // Essential WebView configurations for high-fidelity HTML/CSS/JS execution
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mediaPlaybackRequiresUserGesture = false

        // Custom WebViewClient to stay inside the app
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Hide loading spinner once page is loaded
                progressBar.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                super.onReceivedError(view, errorCode, description, failingUrl)
                // Fallback notice if server is offline
                Toast.makeText(
                    this@MainActivity,
                    "Unable to connect to TubeFlow Server. Make sure app.py is running on localhost!",
                    Toast.LENGTH_LONG
                ).show()
                progressBar.visibility = View.GONE
            }
        }

        // Custom WebChromeClient to manage loading spinner
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                } else {
                    progressBar.visibility = View.GONE
                }
            }
        }

        // Native Download Listener - Intercepts file downloads and hands them over to Android System DownloadManager
        webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
            try {
                val request = DownloadManager.Request(Uri.parse(url))
                request.setMimeType(mimetype)
                
                // Parse safe filename (decodes RFC 5987 Unicode names like Hindi/Urdu/Emojis correctly)
                var filename = URLUtil.guessFileName(url, contentDisposition, mimetype)
                try {
                    if (contentDisposition != null && contentDisposition.contains("filename*=UTF-8''")) {
                        val rawName = contentDisposition.substringAfter("filename*=UTF-8''")
                        filename = Uri.decode(rawName)
                    }
                } catch (e: Exception) {
                    // Fallback to default guessed name
                }
                
                // Configure native Android DownloadManager Request
                request.addRequestHeader("User-Agent", userAgent)
                request.setDescription("Downloading file from TubeFlow...")
                request.setTitle(filename)
                
                if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) {
                    request.allowScanningByMediaScanner()
                }
                
                // Show notification in Android notification bar
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                
                // Enqueue standard background download
                val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                dm.enqueue(request)
                
                Toast.makeText(applicationContext, "Starting native download: $filename", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(applicationContext, "Download failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    // Handle Android system back press to go back inside web history instead of closing the app
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
