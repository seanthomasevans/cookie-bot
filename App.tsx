import React, { useState, useEffect, useRef } from 'react';
import { generateStencilImage, suggestDesigns, editStencilImage } from './services/geminiService';
import Viewer3D from './components/Viewer3D';
import { CutterSettings, DesignAsset, ChatMessage } from './types';
import { Loader2, Download, Wand2, Upload, AlertCircle, Plus, Image as ImageIcon, Trash2, Box, Square, Circle, Hexagon, Type as TypeIcon, User as UserIcon, Paperclip, X, Lock, ImagePlus, MessageSquare, Send, Bot } from 'lucide-react';

const App: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);

  const [themeInput, setThemeInput] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  
  const [designs, setDesigns] = useState<DesignAsset[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Updated Defaults based on user feedback:
  // - Detail Height: 3.5mm
  // - Frame Thickness: 2.0mm (Thicker edge)
  // - Frame Height: 8.0mm (Lower edge)
  const [settings, setSettings] = useState<CutterSettings>({
    width: 90,           
    height: 90,
    baseThickness: 2.0,    
    detailHeight: 3.5, 
    invert: false,
    threshold: 160, 
    smoothing: 0,
    shape: 'outline', 
    frameThickness: 2.0, // Thicker default
    frameHeight: 8.0, // Lower default
  });

  const [exportTrigger, setExportTrigger] = useState(0);

  useEffect(() => {
    const checkKey = async () => {
      try {
        if ((window as any).aistudio) {
          const hasKey = await (window as any).aistudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        }
      } catch (e) {
        console.error("Key check failed", e);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [designs, selectedDesignId, isEditing]);

  const handleSelectKey = async () => {
    try {
      if ((window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
        // Assume success if it resolves
        setHasApiKey(true);
      }
    } catch (e) {
      console.error("Key selection failed", e);
      // Reset to force retry if needed
      setHasApiKey(false);
    }
  };

  const updateDesign = (id: string, updates: Partial<DesignAsset>) => {
    setDesigns(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const handlePlanDesigns = async () => {
    if (!themeInput) return;
    setIsPlanning(true);
    try {
      const suggestions = await suggestDesigns(themeInput);
      const newDesigns: DesignAsset[] = suggestions.map((s, i) => ({
        id: crypto.randomUUID(),
        title: s.title,
        visualPrompt: s.visualPrompt,
        category: s.category,
        imageUrl: null,
        status: 'idle',
        chatHistory: []
      }));
      setDesigns(newDesigns);
      if (newDesigns.length > 0) {
        setSelectedDesignId(newDesigns[0].id);
      }
    } catch (e) {
      console.error(e);
      const fallback: DesignAsset = {
        id: crypto.randomUUID(),
        title: themeInput,
        visualPrompt: themeInput,
        category: 'portrait',
        imageUrl: null,
        status: 'idle',
        chatHistory: []
      };
      setDesigns([fallback]);
      setSelectedDesignId(fallback.id);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleImageToDesign = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const newAsset: DesignAsset = {
          id: crypto.randomUUID(),
          title: file.name.split('.')[0],
          visualPrompt: "Stencil line art based on this image",
          category: 'portrait',
          imageUrl: null,
          referenceImage: result, // Set as reference!
          status: 'idle',
          chatHistory: []
        };
        setDesigns(prev => [...prev, newAsset]);
        setSelectedDesignId(newAsset.id);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateAsset = async (id: string) => {
    const design = designs.find(d => d.id === id);
    if (!design) return;

    updateDesign(id, { status: 'generating', errorMessage: undefined });
    setSelectedDesignId(id);

    try {
      const url = await generateStencilImage(
        design.visualPrompt,
        design.category,
        settings.width, 
        settings.height,
        design.referenceImage // Pass the reference image if it exists
      );
      updateDesign(id, { imageUrl: url, status: 'done' });
    } catch (e) {
      updateDesign(id, { status: 'error', errorMessage: 'Failed to generate' });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newAsset: DesignAsset = {
          id: crypto.randomUUID(),
          title: file.name.split('.')[0],
          visualPrompt: 'User uploaded',
          category: 'portrait', // Default to portrait for uploads
          imageUrl: event.target?.result as string,
          status: 'done',
          chatHistory: []
        };
        setDesigns(prev => [...prev, newAsset]);
        setSelectedDesignId(newAsset.id);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            updateDesign(id, { referenceImage: event.target?.result as string });
        };
        reader.readAsDataURL(file);
    }
  };

  const clearReference = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      updateDesign(id, { referenceImage: undefined });
  };

  const handleExport = () => {
    setExportTrigger(prev => prev + 1);
  };

  const removeDesign = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDesigns(prev => prev.filter(d => d.id !== id));
    if (selectedDesignId === id) {
      setSelectedDesignId(null);
    }
  };

  const handleDimensionChange = (dimension: 'width' | 'height' | 'both', value: number) => {
    if (settings.shape === 'circle' || settings.shape === 'outline' || dimension === 'both') {
      setSettings(s => ({ ...s, width: value, height: value }));
    } else {
      setSettings(s => ({ ...s, [dimension]: value }));
    }
  };

  // --- Chat / Edit Handlers ---

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !selectedDesignId) return;
    
    const design = designs.find(d => d.id === selectedDesignId);
    if (!design || !design.imageUrl) return;

    const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: chatInput,
        timestamp: Date.now()
    };

    // Optimistic update
    updateDesign(selectedDesignId, {
        chatHistory: [...design.chatHistory, userMsg]
    });
    setChatInput('');
    setIsEditing(true);

    try {
        const newImageUrl = await editStencilImage(design.imageUrl, userMsg.text);
        
        const aiMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'model',
            text: "I've updated the design based on your request.",
            timestamp: Date.now()
        };

        updateDesign(selectedDesignId, {
            imageUrl: newImageUrl,
            chatHistory: [...design.chatHistory, userMsg, aiMsg]
        });
    } catch (e) {
        const errorMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'model',
            text: "Sorry, I couldn't edit the image. Please try a different instruction.",
            timestamp: Date.now()
        };
        updateDesign(selectedDesignId, {
            chatHistory: [...design.chatHistory, userMsg, errorMsg]
        });
    } finally {
        setIsEditing(false);
    }
  };

  if (!isCheckingKey && !hasApiKey) {
    return (
      <div className="flex h-screen w-full bg-gray-950 text-gray-100 font-sans items-center justify-center">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-2xl">
          <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-6">
            <Lock className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Unlock Pro Generation</h1>
          <p className="text-gray-400 mb-8 leading-relaxed">
            To use the advanced <strong>Gemini 3 Pro</strong> image model for high-fidelity portraits, you need to connect your Google Cloud API key.
          </p>
          <button 
            onClick={handleSelectKey}
            className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg transform hover:scale-[1.02]"
          >
            Connect API Key
          </button>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="mt-6 text-xs text-gray-600 hover:text-gray-400 transition-colors">
            Read about Gemini API Billing
          </a>
        </div>
      </div>
    );
  }

  const selectedDesign = designs.find(d => d.id === selectedDesignId);
  const showChat = selectedDesign?.imageUrl && isChatOpen;

  return (
    <div className="flex h-screen w-full bg-gray-950 text-gray-100 font-sans">
      {/* Left Sidebar - Controls */}
      <div className="w-96 flex flex-col border-r border-gray-800 bg-gray-900/50 backdrop-blur-sm h-full overflow-hidden shrink-0">
        <div className="p-6 border-b border-gray-800 shrink-0">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-500">
            CookieBot
          </h1>
          <p className="text-gray-400 text-sm mt-1">Turn your ideas into delicious cookies</p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-6 space-y-8">
            
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">1. Design Source</h2>
              
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                    <input
                    type="text"
                    value={themeInput}
                    onChange={(e) => setThemeInput(e.target.value)}
                    placeholder="Describe theme (e.g. Cat)"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all placeholder-gray-600"
                    onKeyDown={(e) => e.key === 'Enter' && handlePlanDesigns()}
                    />
                    <button
                    onClick={handlePlanDesigns}
                    disabled={isPlanning || !themeInput}
                    className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white p-2 rounded-lg transition-colors"
                    title="Generate from Text"
                    >
                    {isPlanning ? <Loader2 className="animate-spin w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    </button>
                </div>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-gray-800"></div>
                    </div>
                    <div className="relative flex justify-center">
                        <span className="px-2 bg-gray-900/50 text-[10px] text-gray-500 uppercase">Or</span>
                    </div>
                </div>

                <label className="flex items-center justify-center gap-2 w-full p-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg cursor-pointer transition-colors text-sm text-gray-300">
                    <ImagePlus className="w-4 h-4 text-orange-400" />
                    <span>Start from Image</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageToDesign} />
                </label>
              </div>
            </div>

            {designs.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">2. Assets</h2>
                  <label className="cursor-pointer text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    <Upload className="w-3 h-3" /> Import STL Ready
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                  </label>
                </div>

                <div className="space-y-2">
                  {designs.map((design) => (
                    <div 
                      key={design.id}
                      onClick={() => setSelectedDesignId(design.id)}
                      className={`group relative flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        selectedDesignId === design.id 
                          ? 'bg-gray-800 border-orange-500/50 ring-1 ring-orange-500/20' 
                          : 'bg-gray-800/40 border-gray-800 hover:border-gray-700 hover:bg-gray-800'
                      }`}
                    >
                      {/* Thumbnail Area */}
                      <div className="w-12 h-12 shrink-0 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center overflow-hidden relative">
                        {design.status === 'generating' ? (
                          <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                        ) : design.imageUrl ? (
                          <img src={design.imageUrl} alt={design.title} className="w-full h-full object-cover" />
                        ) : design.referenceImage ? (
                           <>
                             <img src={design.referenceImage} alt="Ref" className="w-full h-full object-cover opacity-50 grayscale" />
                             <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <Paperclip className="w-4 h-4 text-white drop-shadow-md" />
                             </div>
                           </>
                        ) : design.status === 'error' ? (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-gray-600" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-gray-200 truncate">{design.title}</h3>
                            {design.category === 'typography' ? (
                                <span title="Typography"><TypeIcon className="w-3 h-3 text-blue-400" /></span>
                            ) : (
                                <span title="Portrait"><UserIcon className="w-3 h-3 text-green-400" /></span>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                            {design.status === 'idle' ? (design.referenceImage ? 'Ref ready' : 'Ready') : design.status}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                          {/* Reference Upload Button */}
                          {(design.status === 'idle' || design.status === 'error') && (
                              <>
                                <label 
                                    className={`p-2 rounded-lg cursor-pointer transition-colors ${design.referenceImage ? 'text-green-400 bg-green-400/10 hover:bg-green-400/20' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
                                    title={design.referenceImage ? "Change Reference Image" : "Upload Reference Image for Guidance"}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Paperclip className="w-4 h-4" />
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept="image/*" 
                                        onChange={(e) => handleReferenceUpload(e, design.id)} 
                                    />
                                </label>
                                {design.referenceImage && (
                                     <button
                                        onClick={(e) => clearReference(e, design.id)}
                                        className="p-1 rounded-full text-gray-500 hover:text-red-400"
                                        title="Remove Reference"
                                     >
                                        <X className="w-3 h-3" />
                                     </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleGenerateAsset(design.id); }}
                                    className="p-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors shadow-lg shadow-orange-900/20"
                                    title="Generate with AI"
                                >
                                    <Wand2 className="w-4 h-4" />
                                </button>
                              </>
                          )}
                      </div>
                      
                      <button
                        onClick={(e) => removeDesign(e, design.id)}
                        className="absolute -top-2 -right-2 p-1 rounded-full bg-gray-700 text-gray-400 hover:bg-red-900 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shadow-lg border border-gray-600 z-10"
                      >
                         <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-6 pt-4 border-t border-gray-800">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">3. Cutter Settings</h2>

              <div className="grid grid-cols-3 gap-2">
                 <button
                  onClick={() => setSettings({ ...settings, shape: 'outline' })}
                  className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                    settings.shape === 'outline'
                      ? 'bg-orange-600/20 border-orange-500 text-orange-400'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  <Hexagon className="w-4 h-4" /> Bubble
                </button>
                <button
                  onClick={() => setSettings({ ...settings, shape: 'rectangle' })}
                  className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                    settings.shape === 'rectangle'
                      ? 'bg-orange-600/20 border-orange-500 text-orange-400'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  <Square className="w-4 h-4" /> Box
                </button>
                <button
                  onClick={() => setSettings({ ...settings, shape: 'circle', height: settings.width })}
                  className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                    settings.shape === 'circle'
                      ? 'bg-orange-600/20 border-orange-500 text-orange-400'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  <Circle className="w-4 h-4" /> Circle
                </button>
              </div>

              <div className="space-y-4">
                 {settings.shape === 'rectangle' ? (
                     <>
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span>Width (mm)</span>
                                <span className="text-gray-400">{settings.width}</span>
                            </div>
                            <input
                                type="range"
                                min="30"
                                max="150"
                                value={settings.width}
                                onChange={(e) => handleDimensionChange('width', Number(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span>Height (mm)</span>
                                <span className="text-gray-400">{settings.height}</span>
                            </div>
                            <input
                                type="range"
                                min="30"
                                max="150"
                                value={settings.height}
                                onChange={(e) => handleDimensionChange('height', Number(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                            />
                        </div>
                     </>
                 ) : (
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                        <span>{settings.shape === 'circle' ? 'Diameter' : 'Size (Scale)'} (mm)</span>
                        <span className="text-gray-400">{settings.width}</span>
                        </div>
                        <input
                        type="range"
                        min="30"
                        max="150"
                        value={settings.width}
                        onChange={(e) => handleDimensionChange('both', Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                        />
                    </div>
                 )}

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Threshold</span>
                    <span className="text-gray-400">{settings.threshold}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={settings.threshold}
                    onChange={(e) => setSettings({ ...settings, threshold: Number(e.target.value) })}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Adjust to sharpen the lines</p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Invert Pattern</span>
                  <button 
                    onClick={() => setSettings(s => ({...s, invert: !s.invert}))}
                    className={`w-11 h-6 flex items-center rounded-full transition-colors ${settings.invert ? 'bg-orange-600' : 'bg-gray-700'}`}
                  >
                    <span className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${settings.invert ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                
                 <div>
                   <div className="flex justify-between text-xs mb-1">
                      <span>Cutter Wall Height (mm)</span>
                      <span className="text-gray-400">{settings.frameHeight}</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="20"
                      step="1"
                      value={settings.frameHeight}
                      onChange={(e) => setSettings({ ...settings, frameHeight: Number(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                </div>
                
                 <div>
                   <div className="flex justify-between text-xs mb-1">
                      <span>Cutter Wall Thickness (mm)</span>
                      <span className="text-gray-400">{settings.frameThickness}</span>
                    </div>
                    <input
                      type="range"
                      min="0.4"
                      max="5.0"
                      step="0.2"
                      value={settings.frameThickness}
                      onChange={(e) => setSettings({ ...settings, frameThickness: Number(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                </div>

                 <div>
                   <div className="flex justify-between text-xs mb-1">
                      <span>Stamp Relief Depth (mm)</span>
                      <span className="text-gray-400">{settings.detailHeight}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.5"
                      value={settings.detailHeight}
                      onChange={(e) => setSettings({ ...settings, detailHeight: Number(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                </div>
              </div>
            </div>

            <button
              onClick={handleExport}
              disabled={!selectedDesign?.imageUrl}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-semibold py-3 px-4 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all"
            >
              <Download className="w-5 h-5" /> Export STL
            </button>
          </div>
        </div>
      </div>

      {/* Main Viewer */}
      <div className="flex-1 relative bg-black flex flex-col min-w-0">
        {selectedDesign?.imageUrl ? (
             <Viewer3D 
              imageSrc={selectedDesign.imageUrl} 
              settings={settings} 
              exportTrigger={exportTrigger}
              onExportComplete={() => setExportTrigger(0)}
            />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 space-y-4">
            <div className="w-20 h-20 border-2 border-gray-800 rounded-2xl flex items-center justify-center bg-gray-900/50">
              <Box className="w-10 h-10 opacity-30" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-gray-500">
                {selectedDesign ? `Generate "${selectedDesign.title}" to view 3D model` : "Select or create a design"}
              </p>
              <p className="text-sm text-gray-700 mt-2 max-w-xs mx-auto">
                Set your Shape & Size on the left, then click Generate.
              </p>
            </div>
          </div>
        )}
        
        {selectedDesign?.imageUrl && (
            <div className="absolute top-6 left-6 w-64 h-64 bg-gray-800 rounded-lg border-2 border-gray-700 overflow-hidden shadow-xl pointer-events-none z-20">
                <img src={selectedDesign.imageUrl} alt="Source" className="w-full h-full object-cover opacity-80" />
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-xs text-center py-1 text-white">2D Line Art</div>
            </div>
        )}

        {/* Chat Toggle (if chat is closed) */}
        {selectedDesign?.imageUrl && !isChatOpen && (
          <button 
             onClick={() => setIsChatOpen(true)}
             className="absolute bottom-6 right-6 p-4 bg-orange-600 hover:bg-orange-500 text-white rounded-full shadow-lg z-30 transition-transform hover:scale-110"
          >
              <MessageSquare className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Right Sidebar - Chat Interface */}
      {showChat && (
        <div className="w-80 border-l border-gray-800 bg-gray-900/80 backdrop-blur flex flex-col shrink-0 transition-all">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="font-semibold text-gray-200 flex items-center gap-2">
              <Bot className="w-4 h-4 text-orange-500" />
              AI Editor
            </h3>
            <button 
              onClick={() => setIsChatOpen(false)}
              className="p-1 rounded hover:bg-gray-800 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {selectedDesign.chatHistory.length === 0 && (
                <div className="text-center text-gray-500 text-xs py-8">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p>Ask me to refine the design.</p>
                    <p className="mt-1">"Make lines thicker"</p>
                    <p>"Add a hat"</p>
                </div>
            )}
            {selectedDesign.chatHistory.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-lg p-3 text-sm ${msg.role === 'user' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
                        {msg.text}
                    </div>
                </div>
            ))}
            {isEditing && (
                 <div className="flex justify-start">
                    <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                        <span className="text-xs text-gray-400">Updating design...</span>
                    </div>
                </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-gray-800 bg-gray-900">
             <div className="relative">
                 <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !isEditing && handleSendMessage()}
                    placeholder="Describe changes..."
                    disabled={isEditing}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-4 pr-10 text-sm focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-50"
                 />
                 <button 
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || isEditing}
                    className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-white disabled:text-gray-600 transition-colors"
                 >
                     <Send className="w-4 h-4" />
                 </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;