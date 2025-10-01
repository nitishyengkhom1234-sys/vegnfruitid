import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { PRODUCE } from './constants';
import type { PredictionResult, ProduceKey } from './types';
import { getRipenessPrediction, identifyProduce } from './services/geminiService';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // remove "data:*/*;base64," prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};

const LoadingSpinner: React.FC<{text?: string}> = ({ text = "Analyzing..."}) => (
    <div className="flex items-center justify-center space-x-2">
        <div className="w-4 h-4 rounded-full animate-pulse bg-red-600"></div>
        <div className="w-4 h-4 rounded-full animate-pulse bg-red-600" style={{ animationDelay: '0.2s' }}></div>
        <div className="w-4 h-4 rounded-full animate-pulse bg-red-600" style={{ animationDelay: '0.4s' }}></div>
        <span className="text-red-700 font-semibold">{text}</span>
    </div>
);


const App: React.FC = () => {
  const API_KEY = process.env.API_KEY;

  if (!API_KEY) {
    return (
      <div className="p-4 sm:p-8 flex items-center justify-center min-h-screen">
        <div className="bg-white p-6 sm:p-10 rounded-2xl max-w-2xl w-full border border-red-200 shadow-[0_8px_25px_rgba(0,0,0,0.15),0_0_15px_rgba(255,60,60,0.1)] text-center">
          <h1 className="text-2xl font-bold text-red-700">Configuration Error</h1>
          <p className="text-gray-600 mt-2">The Gemini API key is not configured.</p>
          <p className="text-gray-500 mt-4 text-sm">
            Please add your API key as an environment variable named{' '}
            <code className="bg-red-100 text-red-800 p-1 rounded font-mono">API_KEY</code>{' '}
            in your Vercel project settings and redeploy the application.
          </p>
        </div>
      </div>
    );
  }

  const [selectedProduceKey, setSelectedProduceKey] = useState<ProduceKey>('apple');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>("Analyzing...");
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  
  const [suggestedProduceKey, setSuggestedProduceKey] = useState<ProduceKey | null>(null);

  const [searchText, setSearchText] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProduce = useMemo(() => PRODUCE.find(f => f.value === selectedProduceKey), [selectedProduceKey]);

  useEffect(() => {
    if (selectedProduce) {
      setSearchText(selectedProduce.label);
    }
  }, [selectedProduce]);

   useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
        if (selectedProduce) {
            setSearchText(selectedProduce.label);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchContainerRef, selectedProduce]);

  const resetAnalysisState = useCallback(() => {
    setPrediction(null);
    setError(null);
    setSuggestedProduceKey(null);
  }, []);

  const continueAnalysis = useCallback(async (produceKey: ProduceKey, imageBase64: string, mimeType: string) => {
    const produce = PRODUCE.find(p => p.value === produceKey);
    if (!produce) {
        setError("Invalid produce selected for analysis.");
        setIsLoading(false);
        return;
    }
    
    setIsLoading(true); // Ensure loading is active
    setError(null);

    try {
        setLoadingText("Analyzing ripeness...");
        const result = await getRipenessPrediction(imageBase64, mimeType, produce.label);
        setPrediction(result);
    } catch (err) {
        console.error(err);
        setError('Failed to complete analysis. The model may be unavailable. Please try again later.');
    } finally {
        setIsLoading(false);
    }
  }, []);


  const startAnalysis = useCallback(async (fileToAnalyze?: File) => {
    const currentFile = fileToAnalyze || imageFile;
    if (!currentFile || !selectedProduce) {
        setError('Please select a produce item and an image first.');
        return;
    }

    setIsLoading(true);
    resetAnalysisState();
    
    try {
        setLoadingText("Identifying produce...");
        const base64Image = await fileToBase64(currentFile);
        const detectedProduceValue = await identifyProduce(base64Image, currentFile.type);

        if (detectedProduceValue === 'None') {
            setError("No recognizable fruit or vegetable was found. Please try another photo.");
            setIsLoading(false);
            return;
        }
        
        if (detectedProduceValue && detectedProduceValue !== selectedProduceKey) {
            setSuggestedProduceKey(detectedProduceValue as ProduceKey);
            setIsLoading(false); // Pause for user input
            return;
        }

        await continueAnalysis(selectedProduceKey, base64Image, currentFile.type);

    } catch (err) {
        console.error(err);
        setError('An AI error occurred during identification. Please try again.');
        setIsLoading(false);
    }
  }, [imageFile, selectedProduceKey, selectedProduce, resetAnalysisState, continueAnalysis]);


  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) {
        setError("Camera is not ready. Please try again.");
        setIsCameraOpen(false);
        return;
    }
    
    try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error("Could not get canvas context.");
        }
        
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob) {
            throw new Error("Could not create blob from canvas.");
        }
        
        const capturedFile = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        setImageFile(capturedFile);
        setImagePreviewUrl(URL.createObjectURL(capturedFile));
        setIsCameraOpen(false); 
        resetAnalysisState();
        await startAnalysis(capturedFile);
        
    } catch (err) {
        console.error("Capture failed:", err);
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during capture.";
        setError(`Failed to capture image: ${errorMessage}`);
        setIsCameraOpen(false);
    }
}, [resetAnalysisState, startAnalysis]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    
    const enableStream = async () => {
        if (isCameraOpen && videoRef.current) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            } catch (err) {
                console.error("Error accessing camera: ", err);
                setError("Could not access the camera. Please check browser permissions and ensure no other app is using it.");
                setIsCameraOpen(false);
            }
        }
    };
    
    enableStream();
    
    return () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };
}, [isCameraOpen]);
  
  const filteredProduce = useMemo(() => {
    if (!isSearchFocused) return [];
    const lowercasedQuery = searchText.toLowerCase();
    return PRODUCE.filter(p => p.label.toLowerCase().includes(lowercasedQuery));
  }, [searchText, isSearchFocused]);

  const handleProduceSelect = (produceKey: ProduceKey) => {
    if (produceKey !== selectedProduceKey) {
        handleClearImage();
    }
    setSelectedProduceKey(produceKey);
    setIsSearchFocused(false);
  };
  
  const handleSearchFocus = () => {
    setIsSearchFocused(true);
    setSearchText('');
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreviewUrl(previewUrl);
      resetAnalysisState();
    }
  };

  const handleClearImage = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
    resetAnalysisState();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleCameraOpen = () => {
     if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Camera is not supported on this device.");
      return;
    }
    setError(null);
    setIsCameraOpen(true);
  }

  const handleSuggestion = async (useSuggestion: boolean) => {
    if (!imageFile) return;

    const produceToAnalyze = (useSuggestion && suggestedProduceKey) ? suggestedProduceKey : selectedProduceKey;
    if (useSuggestion && suggestedProduceKey) {
        setSelectedProduceKey(suggestedProduceKey);
    }
    setSuggestedProduceKey(null);

    const base64Image = await fileToBase64(imageFile);
    await continueAnalysis(produceToAnalyze, base64Image, imageFile.type);
  }


  const getDaysText = (days: number): string => {
    if (days > 1) return `${days.toFixed(1)} days`;
    if (days >= 0 && days <= 1) return `${days.toFixed(1)} days (Ready!)`;
    return `${days.toFixed(1)} days (Past Peak)`;
  }
  
  if (!selectedProduce) {
    return (
        <div className="p-4 sm:p-8 flex items-center justify-center min-h-screen">
            <div className="bg-white p-6 sm:p-10 rounded-2xl max-w-2xl w-full border border-red-200 shadow-[0_8px_25px_rgba(0,0,0,0.15),0_0_15px_rgba(255,60,60,0.1)] text-center">
                <h1 className="text-2xl font-bold text-red-700">An Unexpected Error Occurred</h1>
                <p className="text-gray-600 mt-2">Could not find data for the selected produce. Please try refreshing the page.</p>
            </div>
        </div>
    );
  }

  const suggestedProduce = PRODUCE.find(p => p.value === suggestedProduceKey);

  return (
    <div className="p-4 sm:p-8 flex items-center justify-center min-h-screen">
      <div className="bg-white p-6 sm:p-10 rounded-2xl max-w-2xl w-full border border-red-200 shadow-[0_8px_25px_rgba(0,0,0,0.15),0_0_15px_rgba(255,60,60,0.1)]">
        <h1 className="text-3xl font-extrabold text-center text-red-700 mb-2">
          Project ripo25
        </h1>
        <p className="text-gray-600 text-center mb-8">AI Produce Ripeness Predictor</p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">1. Select a Fruit or Vegetable:</label>
            <div ref={searchContainerRef} className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-20">
                    <span className="text-2xl">{selectedProduce.icon}</span>
                </div>
                <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onFocus={handleSearchFocus}
                    placeholder="Search for a fruit or vegetable..."
                    className="w-full p-3 pl-12 border border-gray-300 rounded-lg bg-white mb-1 focus:ring-red-500 focus:border-red-500 relative"
                />
                {isSearchFocused && (
                <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {filteredProduce.length > 0 ? filteredProduce.map(produce => (
                    <button
                        key={produce.value}
                        onClick={() => handleProduceSelect(produce.value)}
                        className="w-full text-left p-3 hover:bg-red-50 flex items-center space-x-3"
                    >
                        <span className="text-2xl">{produce.icon}</span>
                        <span className="text-gray-800">{produce.label}</span>
                    </button>
                    )) : (
                       <div className="p-3 text-gray-500">No results found.</div>
                    )}
                </div>
                )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">2. Upload or Scan a Photo of your {selectedProduce.label}:</label>
            <div className="flex items-center space-x-2">
              <input 
                ref={fileInputRef}
                type="file" 
                id="imageUpload" 
                accept="image/*" 
                required
                onChange={handleImageUpload}
                className="w-full text-sm text-gray-700 bg-gray-100 p-3 rounded-lg border border-gray-300
                            file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0
                            file:text-sm file:font-semibold file:bg-red-100 file:text-red-700
                            hover:file:bg-red-200 cursor-pointer"
              />
               <button 
                  onClick={handleCameraOpen} 
                  className="p-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  aria-label="Use camera to scan"
                  title="Use camera to scan"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
               </button>
            </div>
          </div>
            
          <button 
            onClick={() => startAnalysis()} 
            disabled={!imageFile || isLoading || !!suggestedProduceKey}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg 
                      transition duration-150 ease-in-out transform hover:scale-[1.02] disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center text-lg"
          >
            {isLoading ? <LoadingSpinner text={loadingText}/> : '3. Analyze Produce'}
          </button>

        </div>

        {suggestedProduce && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                <p className="font-semibold text-blue-800">Did you mean {suggestedProduce.label}?</p>
                <p className="text-sm text-blue-600 mb-3">Our AI thinks this image is a {suggestedProduce.label.split('(')[0].trim()}.</p>
                <div className="flex justify-center space-x-3">
                    <button onClick={() => handleSuggestion(true)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Yes, use {suggestedProduce.icon}</button>
                    <button onClick={() => handleSuggestion(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">No, analyze as {selectedProduce.icon}</button>
                </div>
            </div>
        )}

        {imagePreviewUrl && !isCameraOpen && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2 border-b pb-1">Image Preview:</h3>
            <div className="relative group">
              <img src={imagePreviewUrl} className="w-full h-auto rounded-xl object-contain max-h-64 shadow-lg bg-gray-100" alt="Produce Preview"/>
              {!isLoading && !prediction && !suggestedProduceKey &&
                <button
                  onClick={handleClearImage}
                  className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1.5 hover:bg-opacity-75 transition-colors opacity-50 group-hover:opacity-100"
                  aria-label="Remove image"
                  title="Remove image"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              }
            </div>
          </div>
        )}

        {error && (
            <div className="mt-8 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
                <p className="font-bold">Error</p>
                <p>{error}</p>
            </div>
        )}

        {prediction && (
          <div className="mt-8 p-4 sm:p-6 bg-red-50 rounded-xl border-2 border-red-300">
            <h2 className="text-xl font-bold text-red-800 mb-3">AI Prediction:</h2>
            
            {prediction.isPartlyMissing && (
                <div className="mb-4 p-3 bg-orange-100 border-l-4 border-orange-500 text-orange-800">
                    <div className="flex items-start space-x-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div className="text-sm">
                          <p className="font-bold text-base">Physical Damage Detected</p>
                          <p>{prediction.missingPartDescription}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-4">
                <p className="text-base text-gray-600">Estimated Days to Peak Ripeness:</p>
                <p className="text-3xl font-extrabold text-red-900">{getDaysText(prediction.days)}</p>
            </div>
            <div className="pt-3 border-t border-red-200 space-y-3">
                <div>
                  <p className="text-base text-gray-600">Ripeness Status:</p>
                  <p className="text-xl font-semibold text-gray-800 bg-red-200 inline-block px-3 py-1 rounded-full">{prediction.status}</p>
                </div>
                {prediction.infection_details && prediction.infection_details.name && (
                  <div className="p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800">
                      <div className="flex items-start space-x-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div className="text-sm">
                          <p className="font-bold text-base">Infection Detected: {prediction.infection_details.name}</p>
                          <p><span className="font-semibold">Type:</span> {prediction.infection_details.type}</p>
                          <p><span className="font-semibold">Cause:</span> {prediction.infection_details.cause}</p>
                        </div>
                      </div>
                  </div>
                )}
                 <div>
                  <p className="text-base text-gray-600">Recommendation:</p>
                  <p className="text-lg text-gray-700">{prediction.recommendation}</p>
                </div>
            </div>
          </div>
        )}
      </div>

      {isCameraOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-50 p-4">
          <video ref={videoRef} autoPlay playsInline className="w-full h-auto max-w-4xl max-h-[85%] rounded-lg shadow-2xl border-2 border-gray-500"></video>
          <canvas ref={canvasRef} className="hidden"></canvas>
          
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
            <button 
              onClick={handleCapture}
              className="w-20 h-20 bg-white rounded-full flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-white/50 transition transform active:scale-95"
              aria-label="Capture photo"
            >
                <div className="w-[68px] h-[68px] bg-white rounded-full border-4 border-black"></div>
            </button>
          </div>

          <div className="absolute top-5 right-5">
            <button 
              onClick={() => setIsCameraOpen(false)} 
              className="p-3 bg-gray-700 bg-opacity-50 hover:bg-opacity-75 text-white rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-gray-500"
              aria-label="Close camera"
            >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;