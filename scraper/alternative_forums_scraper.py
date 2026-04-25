import requests
from bs4 import BeautifulSoup
import json
import os
import google.generativeai as genai
from supabase import create_client, Client
from dotenv import load_dotenv
from typing import List, Dict, Optional

# Load environment variables
load_dotenv(dotenv_path=".env.local")

class WikipediaScraper:
    def __init__(self):
        self.url = "https://en.wikipedia.org/wiki/List_of_bus_routes_in_Metro_Manila"

    def fetch_bus_routes(self) -> List[Dict]:
        """
        Scrapes bus routes from Wikipedia's tables.
        """
        print(f"Fetching bus routes from Wikipedia...")
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        try:
            response = requests.get(self.url, headers=headers, timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            routes = []
            tables = soup.find_all('table', class_='wikitable')
            
            for table in tables:
                rows = table.find_all('tr')[1:]
                for row in rows:
                    cols = row.find_all(['td', 'th'])
                    if len(cols) >= 3:
                        route_name = cols[0].get_text(strip=True)
                        origin = cols[1].get_text(strip=True)
                        destination = cols[2].get_text(strip=True)
                        
                        routes.append({
                            "raw_origin": origin,
                            "raw_destination": destination,
                            "vehicle_type": "bus",
                            "steps": [f"Ride bus: {route_name} from {origin} to {destination}"],
                            "data_source": "wikipedia"
                        })
            return routes
        except Exception as e:
            print(f"Error scraping Wikipedia: {e}")
            return []

class SkyscraperCityScraper:
    def __init__(self):
        self.url = "https://www.skyscrapercity.com/forums/philippine-infrastructure-and-mobility.2974/"

    def fetch_transit_updates(self) -> List[Dict]:
        """
        Scrapes SkyscraperCity for transit-related discussions.
        """
        print(f"Fetching transit updates from SkyscraperCity...")
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        try:
            response = requests.get(self.url, headers=headers, timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            updates = []
            threads = soup.find_all('div', class_='structItem-title')
            
            for thread in threads:
                a_tag = thread.find('a')
                if a_tag:
                    title = a_tag.get_text(strip=True)
                    link = a_tag['href']
                    updates.append({
                        "title": title,
                        "url": f"https://www.skyscrapercity.com{link}",
                        "data_source": "skyscrapercity"
                    })
            return updates
        except Exception as e:
            print(f"Error scraping SkyscraperCity: {e}")
            return []

class CommuteDataPipeline:
    def __init__(self):
        # Initialize Gemini
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-1.5-flash')
        else:
            self.model = None

        # Initialize Supabase
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        if not supabase_url or not supabase_key:
            raise ValueError("Supabase credentials not found in environment variables")
        self.supabase: Client = create_client(supabase_url, supabase_key)

    def push_to_supabase(self, route: Dict):
        """
        Inserts the structured data into the Supabase 'routes' table.
        """
        try:
            res = self.supabase.table("routes").insert(route).execute()
            print(f"Successfully pushed route: {route['raw_origin']} -> {route['raw_destination']}")
        except Exception as e:
            print(f"Error pushing to Supabase: {e}")

    def run(self):
        # 1. Scrape Wikipedia for official bus routes
        wiki = WikipediaScraper()
        bus_routes = wiki.fetch_bus_routes()
        print(f"Found {len(bus_routes)} routes on Wikipedia.")
        for route in bus_routes[:20]: # Push top 20 for now
            self.push_to_supabase(route)

        # 2. Scrape SkyscraperCity for general updates
        ssc = SkyscraperCityScraper()
        updates = ssc.fetch_transit_updates()
        print(f"Found {len(updates)} discussions on SkyscraperCity.")
        # Future: Use Gemini to extract routes from these threads

if __name__ == "__main__":
    try:
        pipeline = CommuteDataPipeline()
        pipeline.run()
    except Exception as e:
        print(f"Pipeline failed: {e}")
