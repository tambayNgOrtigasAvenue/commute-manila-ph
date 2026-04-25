import requests
from bs4 import BeautifulSoup
import json
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from typing import List, Dict

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
            # Wikipedia bus routes are usually in tables with class 'wikitable'
            tables = soup.find_all('table', class_='wikitable')
            
            for table in tables:
                rows = table.find_all('tr')[1:] # Skip header
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
            
            print(f"Successfully scraped {len(routes)} bus routes from Wikipedia.")
            return routes
        except Exception as e:
            print(f"Error scraping Wikipedia: {e}")
            return []

class WikipediaPipeline:
    def __init__(self):
        # Initialize Supabase
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        if not supabase_url or not supabase_key:
            raise ValueError("Supabase credentials not found in environment variables")
        self.supabase: Client = create_client(supabase_url, supabase_key)

    def push_to_supabase(self, routes: List[Dict]):
        """
        Inserts the scraped routes into Supabase.
        """
        for route in routes:
            try:
                res = self.supabase.table("routes").insert(route).execute()
                print(f"Pushed route: {route['raw_origin']} -> {route['raw_destination']}")
            except Exception as e:
                print(f"Error pushing to Supabase: {e}")

if __name__ == "__main__":
    scraper = WikipediaScraper()
    bus_routes = scraper.fetch_bus_routes()
    
    if bus_routes:
        pipeline = WikipediaPipeline()
        pipeline.push_to_supabase(bus_routes[:10]) # Push first 10 for testing
