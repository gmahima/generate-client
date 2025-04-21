'use client';

import React, { useEffect, useRef, useState } from 'react';

interface ScalarOptions {
  spec?: object;
  url?: string;
  theme?: {
    colors?: {
      primary?: {
        [key: string]: string;
      };
    };
  };
  isEditable?: boolean;
  showSidebar?: boolean;
}

const ScalarApiReference: React.FC<ScalarOptions> = ({ spec, url }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Load the Scalar script
  useEffect(() => {
    // Skip if already loaded
    if (document.querySelector('script[src*="@scalar/api-reference"]')) {
      setScriptLoaded(true);
      return;
    }
    
    try {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';
      script.async = true;
      script.id = 'scalar-script';
      
      script.onload = () => {
        console.log("Scalar script loaded successfully");
        setScriptLoaded(true);
      };
      
      script.onerror = (e) => {
        console.error("Failed to load Scalar script", e);
        setError("Failed to load API documentation script");
        setLoading(false);
      };
      
      document.body.appendChild(script);
      
      return () => {
        // Only remove if we added it
        const scriptElement = document.getElementById('scalar-script');
        if (scriptElement && scriptElement.parentNode) {
          scriptElement.parentNode.removeChild(scriptElement);
        }
      };
    } catch (err) {
      console.error("Error setting up Scalar script:", err);
      setError("Failed to set up API documentation");
      setLoading(false);
    }
  }, []);

  // Initialize Scalar when script is loaded and container is ready
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current) return;
    
    if (!spec && !url) {
      setError("No specification provided");
      setLoading(false);
      return;
    }

    try {
      // Clear container before initialization
      containerRef.current.innerHTML = '';
      
      // Create a unique ID for the container
      const containerId = `scalar-container-${Math.random().toString(36).substring(2, 9)}`;
      containerRef.current.id = containerId;
      
      // Add a small delay to ensure DOM is properly rendered
      const initTimer = setTimeout(() => {
        if (!containerRef.current) return;
        
        try {
          // Validate that Scalar is available
          if (window.Scalar && typeof window.Scalar.createApiReference === 'function') {
            console.log("Initializing Scalar with spec:", spec ? 'Provided object' : 'None', "URL:", url || 'None');

            // Deep clone the spec to avoid any reference issues
            const specClone = spec ? JSON.parse(JSON.stringify(spec)) : undefined;
            
            window.Scalar.createApiReference(`#${containerId}`, {
              spec: specClone,
              url: url,
              theme: {
                colors: {
                  primary: {
                    500: '#006FEE',
                  },
                },
              },
              isEditable: false,
              showSidebar: true,
            });
            
            setLoading(false);
          } else {
            throw new Error("Scalar API Reference not available");
          }
        } catch (err) {
          console.error("Failed to initialize Scalar:", err);
          setError("Failed to initialize API documentation");
          setLoading(false);
          
          if (containerRef.current) {
            containerRef.current.innerHTML = '<div class="p-4 text-red-600">Failed to load API documentation</div>';
          }
        }
      }, 100); // Small delay to ensure DOM is ready
      
      return () => clearTimeout(initTimer);
    } catch (err) {
      console.error("Error in Scalar setup:", err);
      setError("Failed to set up API documentation");
      setLoading(false);
    }
  }, [spec, url, scriptLoaded]);

  return (
    <div className="scalar-wrapper">
      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md my-2">
          {error}
        </div>
      )}
      
      {loading && !error && (
        <div className="p-4 bg-blue-50 text-blue-600 rounded-md my-2">
          Loading API documentation...
        </div>
      )}
      
      <div 
        ref={containerRef} 
        className="w-full border rounded min-h-[600px] bg-white" 
        data-testid="scalar-container"
      />
    </div>
  );
};

// TypeScript declarations for window object
declare global {
  interface Window {
    Scalar?: {
      createApiReference: (selector: string | HTMLElement, options: ScalarOptions) => void;
    };
  }
}

export default ScalarApiReference; 