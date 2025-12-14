import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Center, Environment, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { CutterSettings } from '../types';
import { createStampGeometry, createCutterFrame, createBasePlate, generateSilhouetteShape, flipGeometryY } from '../utils/meshGenerator';
import { Box, Layers, RefreshCw, Grid3x3, Eye } from 'lucide-react';

// Workaround for missing IntrinsicElements types in some environments
const Group = 'group' as any;
const Mesh = 'mesh' as any;
const AmbientLight = 'ambientLight' as any;
const SpotLight = 'spotLight' as any;
const PointLight = 'pointLight' as any;

interface Viewer3DProps {
  imageSrc: string | null;
  settings: CutterSettings;
  exportTrigger: number;
  onExportComplete: () => void;
}

// White PLA Plastic Material (Matches reference photos)
const plasticMaterial = new THREE.MeshStandardMaterial({
  color: "#f3f4f6", // Off-white/Cool white
  roughness: 0.3,
  metalness: 0.0,
  flatShading: false,
});

const CameraHandler = ({ viewMode }: { viewMode: 'iso' | 'top' }) => {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (!controls) return;
    const orbitalControls = controls as any;
    if (viewMode === 'top') {
      camera.position.set(0, 150, 0);
      camera.lookAt(0, 0, 0);
      orbitalControls.target.set(0, 0, 0);
    } else {
      camera.position.set(50, 60, 60); // Closer ISO view
      camera.lookAt(0, 0, 0);
      orbitalControls.target.set(0, 0, 0);
    }
    orbitalControls.update();
  }, [viewMode, camera, controls]);
  return null;
};

function SceneContent({ imageSrc, settings, exportTrigger, onExportComplete, showGrid }: Viewer3DProps & { showGrid: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const [stampGeometry, setStampGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [frameGeometry, setFrameGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [baseGeometry, setBaseGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const generate = async () => {
      setStampGeometry(null);
      setFrameGeometry(null);
      setBaseGeometry(null);

      if (!imageSrc) return;

      setIsProcessing(true);
      try {
        const stampGeo = await createStampGeometry(imageSrc, settings);
        
        stampGeo.computeBoundingBox();
        const stampBBox = stampGeo.boundingBox!;
        const stampW = stampBBox.max.x - stampBBox.min.x;
        const stampH = stampBBox.max.y - stampBBox.min.y;

        let frameGeo: THREE.BufferGeometry | null = null;
        let baseGeo: THREE.BufferGeometry | null = null;
        let finalGroupScale = 1;

        if (settings.shape === 'outline') {
           const silhouetteShape = await generateSilhouetteShape(imageSrc, settings);
           if (silhouetteShape) {
             frameGeo = createCutterFrame(settings, silhouetteShape);
             baseGeo = createBasePlate(settings, silhouetteShape);
             flipGeometryY(frameGeo);
             flipGeometryY(baseGeo);
             
             frameGeo.computeBoundingBox();
             const frameW = frameGeo.boundingBox!.max.x - frameGeo.boundingBox!.min.x;
             if (frameW > 0) finalGroupScale = settings.width / frameW;
           } else {
             // Fallback
             frameGeo = createCutterFrame({...settings, shape: 'rectangle'});
             baseGeo = createBasePlate({...settings, shape: 'rectangle'});
           }
        } else {
           frameGeo = createCutterFrame(settings);
           baseGeo = createBasePlate(settings);
           const padding = settings.width * 0.05; 
           const availableW = settings.width - (padding * 2);
           const availableH = settings.height - (padding * 2);
           const scaleX = availableW / stampW;
           const scaleY = availableH / stampH;
           const fitScale = Math.min(scaleX, scaleY);
           
           stampGeo.scale(fitScale, fitScale, 1);
           stampGeo.computeBoundingBox();
           const center = new THREE.Vector3();
           stampGeo.boundingBox!.getCenter(center);
           stampGeo.translate(-center.x, -center.y, 0);
           finalGroupScale = 1;
        }

        if (finalGroupScale !== 1) {
             stampGeo.scale(finalGroupScale, finalGroupScale, 1);
             frameGeo?.scale(finalGroupScale, finalGroupScale, 1);
             baseGeo?.scale(finalGroupScale, finalGroupScale, 1);
        }

        if (isMounted) {
          setStampGeometry(stampGeo);
          setFrameGeometry(frameGeo);
          setBaseGeometry(baseGeo);
        }
      } catch (e) {
        console.error("Gen Error", e);
      } finally {
        if (isMounted) setIsProcessing(false);
      }
    };

    generate();
    return () => { isMounted = false; };
  }, [imageSrc, settings.threshold, settings.invert, settings.detailHeight, settings.width, settings.height, settings.shape, settings.frameHeight, settings.frameThickness, settings.baseThickness]);

  useEffect(() => {
    if (exportTrigger === 0 || !groupRef.current) return;
    const exporter = new STLExporter();
    const result = exporter.parse(groupRef.current, { binary: true });
    const blob = new Blob([result], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `CookieBot_${settings.shape}_${Date.now()}.stl`;
    link.click();
    onExportComplete();
  }, [exportTrigger]);

  return (
    <>
      {showGrid && <Grid infiniteGrid sectionSize={10} sectionColor={"#374151"} cellColor={"#1f2937"} fadeDistance={400} position={[0, -0.1, 0]} />}
      <Center position={[0, 0, 0]}>
        <Group ref={groupRef} rotation={[-Math.PI / 2, 0, 0]}>
          {baseGeometry && <Mesh geometry={baseGeometry} material={plasticMaterial} receiveShadow castShadow />}
          {stampGeometry && <Mesh geometry={stampGeometry} material={plasticMaterial} receiveShadow castShadow />}
          {frameGeometry && <Mesh geometry={frameGeometry} material={plasticMaterial} receiveShadow castShadow />}
        </Group>
      </Center>
    </>
  );
}

const Viewer3D = (props: Viewer3DProps) => {
  const [viewMode, setViewMode] = useState<'iso' | 'top'>('iso');
  const [autoRotate, setAutoRotate] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  return (
    <div className="w-full h-full bg-gray-900 rounded-xl overflow-hidden shadow-2xl relative border border-gray-800 flex flex-col">
       <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <div className="bg-gray-800/90 backdrop-blur border border-gray-700 rounded-lg p-1.5 flex flex-col gap-2 shadow-lg">
           <button onClick={() => setViewMode('iso')} className={`p-2 rounded-md ${viewMode === 'iso' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}><Box className="w-5 h-5" /></button>
           <button onClick={() => setViewMode('top')} className={`p-2 rounded-md ${viewMode === 'top' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}><Layers className="w-5 h-5" /></button>
        </div>
        <div className="bg-gray-800/90 backdrop-blur border border-gray-700 rounded-lg p-1.5 flex flex-col gap-2 shadow-lg">
          <button onClick={() => setAutoRotate(!autoRotate)} className={`p-2 rounded-md ${autoRotate ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}><RefreshCw className={`w-5 h-5 ${autoRotate ? 'animate-spin' : ''}`} /></button>
           <button onClick={() => setShowGrid(!showGrid)} className={`p-2 rounded-md ${showGrid ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}><Grid3x3 className="w-5 h-5" /></button>
        </div>
      </div>
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 40 }}>
        <CameraHandler viewMode={viewMode} />
        <AmbientLight intensity={0.4} />
        {/* Main Key Light */}
        <SpotLight position={[40, 80, 60]} angle={0.4} penumbra={0.4} castShadow intensity={1.2} shadow-bias={-0.0001} />
        {/* Fill Light */}
        <PointLight position={[-40, 30, -40]} intensity={0.6} color="#eef2ff" />
        {/* Rim Light for edge definition */}
        <SpotLight position={[0, 10, -50]} intensity={1.5} color="#ffffff" angle={0.6} />
        <Environment preset="city" />
        <SceneContent {...props} showGrid={showGrid} />
        <OrbitControls makeDefault autoRotate={autoRotate} autoRotateSpeed={2} minPolarAngle={0} maxPolarAngle={Math.PI / 2} />
      </Canvas>
      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="bg-black/50 backdrop-blur-sm text-gray-300 px-3 py-1.5 rounded-full text-xs border border-gray-800 flex items-center gap-2">
          <Eye className="w-3 h-3 text-orange-400" />
          <span>White PLA Preview</span>
        </div>
      </div>
    </div>
  );
};

export default Viewer3D;