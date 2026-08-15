'use client';

import { useEffect, useRef, useState } from 'react';

const DEFAULT_CENTER = [78.486671, 17.385044]; // Hyderabad [lng, lat]

const CARTO_TILES = [
  'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
];

const OSM_TILES = [
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
];

const LIGHT_STYLE = {
  version: 8,
  sources: {
    'base-tiles': {
      type: 'raster',
      tiles: CARTO_TILES,
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }
  },
  layers: [
    { id: 'base-tiles-layer', type: 'raster', source: 'base-tiles' }
  ]
};

// Script-loading helper with a shared promise so React StrictMode double-mount
// never loads the library twice.
let maplibrePromise = null;
function loadMapLibre() {
  if (maplibrePromise) return maplibrePromise;
  const urls = [
    'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js',
    'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
  ];
  maplibrePromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = urls[0].replace('.js', '.css');
    document.head.appendChild(css);

    let attempt = 0;
    const tryNext = () => {
      if (attempt >= urls.length) {
        reject(new Error('Could not load MapLibre from any CDN'));
        return;
      }
      const s = document.createElement('script');
      s.src = urls[attempt];
      s.onload = () => {
        if (window.maplibregl) resolve(window.maplibregl);
        else reject(new Error('MapLibre loaded but maplibregl global is missing'));
      };
      s.onerror = () => {
        s.remove();
        attempt++;
        tryNext();
      };
      document.head.appendChild(s);
    };
    tryNext();
  });
  return maplibrePromise;
}

export default function LocationPicker({ value, onChange }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const liveDotRef = useRef(null);
  const accuracyRingRef = useRef(null);
  const watchIdRef = useRef(null);
  const toolRef = useRef('select');
  const [tool, setTool] = useState('select');
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState('');

  // meters per pixel at a given zoom (Web Mercator)
  const metersPerPixel = (lat, zoom) =>
    156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);

  const updateAccuracyRing = (maplibregl, lng, lat, meters) => {
    if (!mapInstanceRef.current || !maplibregl || meters == null) return;
    const sizePx = (2 * meters) / metersPerPixel(lat, mapInstanceRef.current.getZoom());
    if (accuracyRingRef.current) {
      accuracyRingRef.current.remove();
    }
    const el = document.createElement('div');
    el.className = 'lp-map-accuracy-ring';
    el.style.width = `${sizePx}px`;
    el.style.height = `${sizePx}px`;
    accuracyRingRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(mapInstanceRef.current);
  };

  const showLiveLocation = (maplibregl, lng, lat, meters) => {
    if (!mapInstanceRef.current || !maplibregl) return;
    if (!liveDotRef.current) {
      const el = document.createElement('div');
      el.className = 'lp-map-live-dot';
      liveDotRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(mapInstanceRef.current);
    } else {
      liveDotRef.current.setLngLat([lng, lat]);
    }
    updateAccuracyRing(maplibregl, lng, lat, meters);
    setAccuracy(Math.round(meters));
  };

  const clearLiveTracking = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (liveDotRef.current) {
      liveDotRef.current.remove();
      liveDotRef.current = null;
    }
    if (accuracyRingRef.current) {
      accuracyRingRef.current.remove();
      accuracyRingRef.current = null;
    }
    setAccuracy(null);
  };

  useEffect(() => {
    let cancelled = false;
    let map = null;
    let resizeObserver = null;
    let tilesFellBack = false;

    const checkWebGL = () => {
      try {
        const canvas = document.createElement('canvas');
        return !!(
          window.WebGL2RenderingContext &&
          (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
        );
      } catch {
        return false;
      }
    };

    loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || mapInstanceRef.current || !mapRef.current) return;
        if (!checkWebGL()) {
          setError('WebGL is not available in this browser, so the 3D map cannot render.');
          return;
        }

        try {
          map = new maplibregl.Map({
            container: mapRef.current,
            center: DEFAULT_CENTER,
            zoom: 13,
            pitch: 55,
            bearing: -20,
            style: LIGHT_STYLE,
            attributionControl: true,
            dragRotate: true
          });

          // Fall back to OSM tiles if the primary tile server fails
          map.on('error', (e) => {
            if (e?.error?.message && e.error.message.includes('tile')) {
              if (!tilesFellBack && map.getSource('base-tiles')) {
                tilesFellBack = true;
                map.getSource('base-tiles').setTiles(OSM_TILES);
              }
            }
          });

          // Lock page scrolling while the pointer is over the map
          map.scrollZoom.enable();
          const canvas = map.getCanvas();
          canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
          canvas.style.touchAction = 'none';
          canvas.style.cursor = toolRef.current === 'select' ? 'crosshair' : 'grab';

          map.on('load', () => {
            if (cancelled || !map) return;
            try {
              map.addSource('terrain-dem', {
                type: 'raster-dem',
                tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                encoding: 'terrarium',
                tileSize: 256,
                maxzoom: 15
              });
              map.setTerrain({ source: 'terrain-dem', exaggeration: 1.2 });
            } catch (err) {
              // Terrain is optional — never block the map on it
            }
            map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
            map.resize();
          });

          map.on('click', (e) => {
            if (toolRef.current !== 'select') return;
            if (watchIdRef.current != null) return; // locked to live GPS position
            placeMarker(maplibregl, e.lngLat.lng, e.lngLat.lat);
          });

          // Keep the canvas sized correctly on layout shifts & resizes
          window.addEventListener('resize', onWindowResize);
          if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => map?.resize());
            resizeObserver.observe(mapRef.current);
          }

          mapInstanceRef.current = map;
        } catch (err) {
          console.error('Map init failed:', err);
          setError('Could not start the map: ' + (err?.message || err));
        }
      })
      .catch((err) => {
        console.error('maplibre-gl load failed:', err);
        if (!cancelled) {
          setError('Map library failed to load. Check your internet connection, then refresh.');
        }
      });

    function onWindowResize() {
      map?.resize();
    }

    return () => {
      cancelled = true;
      clearLiveTracking();
      window.removeEventListener('resize', onWindowResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToolChange = (nextTool) => {
    toolRef.current = nextTool;
    setTool(nextTool);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.getCanvas().style.cursor = nextTool === 'select' ? 'crosshair' : 'grab';
    }
  };

  const placeMarker = (maplibregl, lng, lat) => {
    if (!mapInstanceRef.current || !maplibregl) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      const el = document.createElement('div');
      el.className = 'lp-map-marker';
      el.innerHTML = '<span class="material-symbols-outlined">location_on</span>';
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(mapInstanceRef.current);
    }
    onChange({ lat, lng, address: value?.address || 'Address resolving...' });

    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)
      .then((r) => r.json())
      .then((data) => {
        const address = data?.display_name || 'Selected location';
        onChange({ lat, lng, address });
      })
      .catch(() => {});
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setError('');
    setAccuracy(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        loadMapLibre()
          .then((maplibregl) => {
            placeMarker(maplibregl, pos.coords.longitude, pos.coords.latitude);
            showLiveLocation(maplibregl, pos.coords.longitude, pos.coords.latitude, pos.coords.accuracy);
            mapInstanceRef.current?.flyTo({
              center: [pos.coords.longitude, pos.coords.latitude],
              zoom: Math.max(15, 17 - Math.log2(Math.max(5, pos.coords.accuracy) / 5)),
              pitch: 55,
              duration: 1600
            });
setLocating(false);
            // Lock to the GPS pin — map clicks must not move it while tracking
            toolRef.current = 'pan';
            setTool('pan');
            if (mapInstanceRef.current) {
              mapInstanceRef.current.getCanvas().style.cursor = 'grab';
            }

            // Uber-style live tracking: keep refining while the user moves
            if (watchIdRef.current == null) {
              watchIdRef.current = navigator.geolocation.watchPosition(
                (p) => {
                  loadMapLibre().then((ml) => {
                    showLiveLocation(ml, p.coords.longitude, p.coords.latitude, p.coords.accuracy);
                  });
                },
                () => {},
                { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
              );
            }
          })
          .catch(() => setLocating(false));
      },
      () => {
        setError('Location access denied. Please click on the map instead.');
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs font-label-caps text-lp-on-surface-variant uppercase tracking-wider">
          Pin Your Location on the 3D Map
        </label>
        <div className="flex items-center gap-2">
          {accuracy != null && (
            <span className="px-2.5 py-1.5 rounded bg-lp-primary-container/10 border border-lp-primary-container/40 text-lp-primary-container font-data-point text-[10px] font-bold">
              ±{accuracy} m accuracy
            </span>
          )}
          {watchIdRef.current != null ? (
            <button
              type="button"
              onClick={clearLiveTracking}
              className="px-3 py-1.5 border border-lp-outline-variant text-lp-on-surface-variant font-label-caps text-[10px] hover:bg-lp-surface-lowest transition-all active:scale-95 cursor-pointer rounded flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-xs">location_off</span>
              Stop Precise
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={locating}
              className="px-3 py-1.5 border border-lp-primary-container/40 text-lp-primary-container font-label-caps text-[10px] hover:bg-lp-primary-container/10 transition-all active:scale-95 cursor-pointer rounded disabled:opacity-50 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-xs">my_location</span>
              {locating ? 'Calibrating...' : 'Precise Location'}
            </button>
          )}
        </div>
      </div>

      <div className="relative w-full h-[280px] sm:h-[320px] md:h-[360px]">
        {/* Map canvas — directly sized, exactly as the versions that rendered for you */}
        <div ref={mapRef} className="w-full h-full rounded-lg border border-lp-outline-variant overflow-hidden" />

        {/* Tool switcher (Google Maps style) */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => handleToolChange('select')}
            title="Select / drop pin (crosshair)"
            className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md ${
              tool === 'select'
                ? 'bg-lp-primary-container text-lp-on-primary-container border-lp-primary-container'
                : 'bg-white text-[#555] border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span className="material-symbols-outlined text-lg">ads_click</span>
          </button>
          <button
            type="button"
            onClick={() => handleToolChange('pan')}
            title="Move map (hand)"
            className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md ${
              tool === 'pan'
                ? 'bg-lp-primary-container text-lp-on-primary-container border-lp-primary-container'
                : 'bg-white text-[#555] border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span className="material-symbols-outlined text-lg">pan_tool_alt</span>
          </button>
        </div>

        {/* Active tool hint */}
        <span className="absolute bottom-3 left-3 z-10 px-2.5 py-1 rounded bg-white/90 border border-gray-200 text-[9px] font-label-caps text-[#555] uppercase tracking-wide shadow-md select-none">
          {tool === 'select' ? 'Select mode · Click to drop pin' : 'Pan mode · Drag to move map'}
        </span>

        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white/85 p-6 text-center">
            <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
            <p className="text-xs font-bold text-[#555]">{error}</p>
          </div>
        )}
      </div>

      <p className="text-[10px] font-label-caps text-lp-on-surface-variant opacity-70 uppercase tracking-wide">
        Drag to rotate · Scroll to tilt · Click to drop a pin · Precise location follows you live
      </p>
      <input
        value={value?.address || ''}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
        placeholder="Or type your full address manually"
        className="px-4 py-3 rounded bg-lp-surface-lowest border border-lp-outline-variant text-sm text-white outline-none focus:border-lp-primary-container transition-colors placeholder:text-lp-on-surface-variant/60"
      />
      {value?.lat != null && (
        <p className="text-[10px] font-label-caps text-lp-primary-container uppercase tracking-wide">
          Pinned: {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
    </div>
  );
}