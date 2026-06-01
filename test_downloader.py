import yt_dlp
import sys

def test_extraction():
    # A standard short, public YouTube video URL (e.g. copyright free trailer or test video)
    test_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'  # Rickroll
    print(f"Testing yt-dlp extraction with URL: {test_url}")
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(test_url, download=False)
            
        if not info:
            print("FAILED: Could not extract video info.")
            return False
            
        print("SUCCESS! Extracted metadata:")
        print(f"  Title: {info.get('title')}")
        print(f"  Author: {info.get('uploader')}")
        print(f"  Duration: {info.get('duration')} seconds")
        print(f"  Number of formats: {len(info.get('formats', []))}")
        
        # Test finding combined video format
        combined = [f for f in info.get('formats', []) if f.get('vcodec') != 'none' and f.get('acodec') != 'none']
        print(f"  Number of combined formats (video+audio): {len(combined)}")
        
        return True
    except Exception as e:
        print(f"FAILED: An error occurred: {str(e)}")
        return False

if __name__ == '__main__':
    success = test_extraction()
    sys.exit(0 if success else 1)
