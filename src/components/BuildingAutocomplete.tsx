import React, { useEffect, useState, useRef } from 'react';
import { Building2, Search, MapPin } from 'lucide-react';

interface BuildingAutocompleteProps {
  onPlaceSelected: (placeData: { name: string, address: string, lat: number, lng: number, place_id?: string }) => void;
}

export default function BuildingAutocomplete({ onPlaceSelected }: BuildingAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // Nominatim OpenStreetMap API (Free, no API key required)
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
        if (response.ok) {
          const data = await response.json();
          setResults(data);
          setShowDropdown(true);
        }
      } catch (error) {
        console.error('Error fetching places:', error);
      } finally {
        setLoading(false);
      }
    }, 600); // 600ms debounce to respect Nominatim API rate limits (1 req/sec)

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (place: any) => {
    const name = place.name || place.display_name.split(',')[0];
    onPlaceSelected({
      name: name,
      address: place.display_name,
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
      place_id: place.place_id.toString()
    });
    setQuery(name);
    setShowDropdown(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Building2 className="h-4 w-4 text-slate-400" />
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
        placeholder="Search for your building / residence..."
        className="w-full text-xs p-3 pl-9 pr-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 font-medium bg-white"
        id="building-autocomplete-input"
        autoComplete="off"
      />
      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
        {loading ? (
          <div className="h-4 w-4 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin"></div>
        ) : (
          <Search className="h-4 w-4 text-slate-400" />
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {results.map((place) => (
            <button
              key={place.place_id}
              onClick={() => handleSelect(place)}
              className="w-full text-left px-4 py-3 hover:bg-orange-50 border-b border-slate-100 last:border-0 transition-colors flex items-start gap-3"
            >
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <span className="block text-xs font-bold text-slate-800">
                  {place.name || place.display_name.split(',')[0]}
                </span>
                <span className="block text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                  {place.display_name}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
