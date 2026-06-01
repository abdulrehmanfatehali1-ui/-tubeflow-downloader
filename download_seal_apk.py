import requests
import json
import os
import sys

def download_latest_seal():
    api_url = "https://api.github.com/repos/JunkFood02/Seal/releases/latest"
    print("Connecting to GitHub API to discover latest Seal Android Downloader release...")
    
    try:
        response = requests.get(api_url, timeout=15)
        response.raise_for_status()
        data = response.json()
        
        tag_name = data.get('tag_name', 'latest')
        print(f"Discovered latest release tag: {tag_name}")
        
        # Look for the arm64-v8a or universal APK inside assets
        target_asset = None
        for asset in data.get('assets', []):
            name = asset.get('name', '')
            if name.endswith('.apk'):
                # Prioritize arm64-v8a as it is standard for modern Androids, or universal
                if 'arm64-v8a' in name:
                    target_asset = asset
                    break
                elif 'universal' in name or target_asset is None:
                    target_asset = asset
                    
        if not target_asset:
            print("FAILED: Could not find any APK assets in the latest release.")
            return False
            
        download_url = target_asset.get('browser_download_url')
        filename = "Seal_Universal_Downloader.apk"
        
        print(f"Targeting asset: {target_asset.get('name')}")
        print(f"Direct download URL: {download_url}")
        print(f"Downloading file and saving locally as '{filename}'...")
        
        # Stream download the APK file
        req = requests.get(download_url, stream=True, timeout=60)
        req.raise_for_status()
        
        total_size = int(req.headers.get('content-length', 0))
        downloaded = 0
        
        with open(filename, 'wb') as f:
            for chunk in req.iter_content(chunk_size=1024 * 1024): # 1MB chunks
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size:
                        percent = (downloaded / total_size) * 100
                        print(f"  Progress: {percent:.1f}% ({downloaded / (1024*1024):.1f}MB / {total_size / (1024*1024):.1f}MB)", end='\r')
                        
        print(f"\nSUCCESS! File downloaded successfully and saved as: {os.path.abspath(filename)}")
        return True
        
    except Exception as e:
        print(f"\nFAILED: An error occurred during download: {str(e)}")
        return False

if __name__ == '__main__':
    success = download_latest_seal()
    sys.exit(0 if success else 1)
