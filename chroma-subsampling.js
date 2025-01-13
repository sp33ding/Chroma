import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const ChromaSubsamplingDemo = () => {
  // Initialize all state
  const [selectedMode, setSelectedMode] = useState('444');
  const [zoom, setZoom] = useState(100);
  const [grid, setGrid] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const workerRef = useRef(null);

  // Calculate grid size based on zoom level
  const getGridSize = () => {
    return Math.max(4, Math.round(4 * (100 / Math.max(1, zoom))));
  };

  const gridSize = getGridSize();

  // Calculate opacity based on position and sampling mode
  const getOpacity = (x, y) => {
    if (selectedMode === '444') {
      return 1.0;
    } else if (selectedMode === '422') {
      return x % 2 === 0 ? 1.0 : 0.85;
    } else { // 420
      if (x % 2 === 0 && y % 2 === 0) {
        return 1.0; // Source pixel
      } else if (x % 2 === 1 && y % 2 === 1) {
        return 0.7; // Diagonal pixel
      } else {
        return 0.85; // Adjacent pixel
      }
    }
  };

  // Handle zoom changes with loading state
  const handleZoomChange = (e) => {
    setIsLoading(true);
    setZoom(parseInt(e.target.value));
  };

  useEffect(() => {
    // Initialize Web Worker with the worker code directly
    const workerCode = `
      // Color conversion utilities 
      const hslToRgb = (h, s, l) => {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const r = hue2rgb(p, q, (h + 1/3));
        const g = hue2rgb(p, q, h);
        const b = hue2rgb(p, q, (h - 1/3));

        return [
          Math.round(r * 255),
          Math.round(g * 255),
          Math.round(b * 255)
        ];
      };

      const rgbToHsl = (r, g, b) => {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
          h = s = 0;
        } else {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }

        return [h, s, l];
      };

      const rgbToHex = (r, g, b) => {
        return '#' + [r, g, b].map(x => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        }).join('');
      };

      // Get base color for position
      const getBaseColor = (x, y, gridSize) => {
        const centerX = gridSize / 2;
        const centerY = gridSize / 2;
        const relX = x - centerX;
        const relY = y - centerY;

        const radius = Math.sqrt(relX * relX + relY * relY);
        const maxRadius = Math.sqrt(2) * gridSize / 2;
        const angle = Math.atan2(relY, relX);

        const hue = ((angle + Math.PI) / (2 * Math.PI));
        const saturation = Math.min(1, radius / (maxRadius * 0.8));
        const lightness = 0.5;

        const [r, g, b] = hslToRgb(hue, saturation, lightness);
        return rgbToHex(r, g, b);
      };

      // Get subsampled color based on mode 
      const getSubsampledColor = (x, y, gridSize, mode) => {
        if (mode === '444') {
          // Full color information for every pixel
          return getBaseColor(x, y, gridSize); 
        }

        if (mode === '422') {
          // Only sample colors at even x positions
          // Odd x positions use the color from their left neighbor
          const sampledX = Math.floor(x / 2) * 2;  // Round down to even number
          return getBaseColor(sampledX, y, gridSize);
        }
        
        if (mode === '420') {
          // Sample colors only at even x positions in even y rows 
          // Odd x positions use color from their left neighbor
          // Odd y rows copy colors from the even row above them
          const sampledX = Math.floor(x / 2) * 2;
          const sampledY = Math.floor(y / 2) * 2;
          return getBaseColor(sampledX, sampledY, gridSize);
        }
      };

      // Worker message handler
      self.onmessage = (e) => {
        const { gridSize, mode } = e.data;
        const colors = [];

        for (let y = 0; y < gridSize; y++) {
          const row = [];
          for (let x = 0; x < gridSize; x++) {
            row.push(getSubsampledColor(x, y, gridSize, mode));
          }
          colors.push(row);
        }

        self.postMessage(colors);
      };
    `;

    workerRef.current = new Worker(
      URL.createObjectURL(
        new Blob([workerCode], { type: 'application/javascript' })
      )
    );

    // Set up message handler
    workerRef.current.onmessage = (e) => {
      setGrid(e.data);
      setIsLoading(false);
    };

    // Clean up
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  useEffect(() => {
    if (workerRef.current) {  
      // Set loading state before requesting new colors
      setIsLoading(true);
      workerRef.current.postMessage({
        gridSize: getGridSize(),
        mode: selectedMode
      });
    }
  }, [selectedMode, zoom]);

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle>Chroma Subsampling Visualization</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          <div className="flex gap-4">
            <button 
              className={`px-4 py-2 rounded ${selectedMode === '444' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              onClick={() => setSelectedMode('444')}
            >
              4:4:4
            </button>
            <button
              className={`px-4 py-2 rounded ${selectedMode === '422' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              onClick={() => setSelectedMode('422')}
            >
              4:2:2  
            </button>
            <button
              className={`px-4 py-2 rounded ${selectedMode === '420' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              onClick={() => setSelectedMode('420')} 
            >
              4:2:0
            </button>
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Zoom Level: {zoom}% ({gridSize}x{gridSize} pixels)</label>
            <input
              type="range"
              min="1" 
              max="100"
              value={zoom}
              onChange={handleZoomChange} 
              className="w-full"
            />
          </div>
          
          <div className="w-52 h-52 bg-gray-100 rounded flex items-center justify-center relative">
            <div className="flex flex-col">
              {grid.map((row, y) => (
                <div key={y} className="flex">
                  {row.map((color, x) => (
                    <div
                      key={`${x}-${y}`} 
                      style={{
                        width: `${200/gridSize}px`,
                        height: `${200/gridSize}px`,
                        backgroundColor: color,
                        opacity: getOpacity(x, y)
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            {isLoading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="bg-white px-6 py-3 rounded-lg shadow-lg">
                  <div className="text-base font-semibold">Rendering...</div>  
                </div>
              </div>
            )}
          </div>
          
          <div className="p-4 bg-gray-100 rounded">
            <h3 className="font-medium mb-2">Current Mode: {selectedMode}</h3>
            <p>
              {selectedMode === '444' && 'Full color sampling - Every pixel has its own unique color information'}
              {selectedMode === '422' && 'Horizontal subsampling - Color is sampled at half resolution horizontally and interpolated between samples. Think of it like this: instead of storing the color of every pixel, we only store every other pixel\'s color horizontally and blend between them - like connecting dots with smooth color gradients.'} 
              {selectedMode === '420' && 'Horizontal and vertical subsampling - Color is sampled at quarter resolution (2x2 blocks) with bilinear interpolation. Imagine dividing the image into 2x2 squares - we only store the color of one pixel per square and smoothly blend that color across all four pixels, like spreading watercolor paint from a single point.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChromaSubsamplingDemo;
