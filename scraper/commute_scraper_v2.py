import requests
import json
import os
import google.generativeai as genai
from supabase import create_client, Client
from dotenv import load_dotenv
from typing import List, Dict, Optional

# Load environment variables
load_dotenv(dotenv_path=".env.local")

class RedlibScraper:
    def __init__(self):
        # Reliable Redlib instances as of 2026
        self.instances = [
            "https://safereddit.com",
            "https://redlib.ducks.party",
            "https://redlib.vny.xyz",
            "https://redlib.freedit.eu",
            "https://redlib.catsarch.com"
        ]

    def fetch_posts(self, subreddit: str = "HowToGetTherePH", limit: int = 10) -> List[Dict]:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json"
        }
        
        for instance in self.instances:
            url = f"{instance}/r/{subreddit}/new.json"
            params = {"limit": limit}
            print(f"Trying Redlib instance: {instance}...")
            
            try:
                response = requests.get(url, params=params, headers=headers, timeout=10)
                if response.status_code == 200 and "application/json" in response.headers.get("Content-Type", ""):
                    data = response.json()
                    posts = []
                    children = data.get('data', {}).get('children', [])
                    for post in children:
                        p = post.get('data', {})
                        if p.get("selftext"):
                            posts.append({
                                "title": p.get("title"),
                                "content": p.get("selftext"),
                                "url": f"https://reddit.com{p.get('permalink')}"
                            })
                    if posts:
                        print(f"Successfully fetched {len(posts)} posts from {instance}")
                        return posts
            except Exception as e:
                print(f"Failed to fetch from {instance}: {e}")
        
        return []

class GeminiProcessor:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key and api_key != "your_gemini_api_key":
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-1.5-flash')
        else:
            self.model = None

    def process(self, post: Dict) -> Optional[Dict]:
        if not self.model:
            return None
            
        prompt = f"""
        Extract commuting instructions from this Reddit post.
        Return a strict JSON object:
        {{
          "origin": "string",
          "destination": "string",
          "vehicle_type": "jeepney|bus|train|multiple",
          "steps": ["step 1", "step 2"]
        }}
        If no clear directions are found, return null.
        
        Title: {post['title']}
        Content: {post['content']}
        """
        try:
            response = self.model.generate_content(prompt)
            text = response.text.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            return json.loads(text)
        except:
            return None

class CommutePipeline:
    def __init__(self):
        url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        self.supabase: Client = create_client(url, key)
        self.redlib = RedlibScraper()
        self.gemini = GeminiProcessor()

    def get_fallback_data(self) -> List[Dict]:
        return [
            {
                "raw_origin": "Cubao",
                "raw_destination": "BGC",
                "vehicle_type": "bus",
                "steps": ["Ride EDSA Carousel to Ayala", "Ride BGC Bus to High Street"],
                "data_source": "fallback_seed"
            },
            {
                "raw_origin": "Makati",
                "raw_destination": "Manila",
                "vehicle_type": "train",
                "steps": ["Ride MRT-3 to Magallanes", "Transfer to PNR to Tutuban"],
                "data_source": "fallback_seed"
            }
        ]

    def run(self):
        print("Starting Scraper Pipeline...")
        posts = self.redlib.fetch_posts(limit=5)
        
        results = []
        if posts:
            print(f"Processing {len(posts)} posts with Gemini...")
            for post in posts:
                structured = self.gemini.process(post)
                if structured:
                    results.append({
                        "raw_origin": structured.get("origin"),
                        "raw_destination": structured.get("destination"),
                        "vehicle_type": structured.get("vehicle_type", "multiple"),
                        "steps": structured.get("steps"),
                        "data_source": "reddit"
                    })
        
        if not results:
            print("Scraping/AI failed or returned no results. Using fallback seed data...")
            results = self.get_fallback_data()

        print(f"Pushing {len(results)} routes to Supabase...")
        for route in results:
            try:
                self.supabase.table("routes").insert(route).execute()
                print(f"Pushed: {route['raw_origin']} -> {route['raw_destination']}")
            except Exception as e:
                print(f"Error pushing to Supabase: {e}")

if __name__ == "__main__":
    try:
        pipeline = CommutePipeline()
        pipeline.run()
    except Exception as e:
        print(f"Pipeline crashed: {e}")
