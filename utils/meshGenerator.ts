import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader';
import ImageTracer from 'imagetracerjs';
import { CutterSettings } from '../types';

// CRITICAL: High resolution for smooth curves. 
// 1200px ensures that when we trace curves, they look like vector art, not pixel art.
const PROCESS_RES = 1200;

const svgToShapes = (svgString: string): THREE.Shape[] => {
  const loader = new SVGLoader();
  const svgData = loader.parse(svgString);
  const shapes: THREE.Shape[] = [];
  svgData.paths.forEach((path) => {
    // .toShapes(true) ensures correct winding order for holes
    const pathShapes = path.toShapes(true);
    pathShapes.forEach((shape) => shapes.push(shape));
  });
  return shapes;
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
};

/**
 * Generates a "Die-Cut Sticker" style outline.
 * 
 * Algorithm:
 * 1. Binarize input.
 * 2. Blur heavily to create a "blob" or "bubble" around the subject.
 * 3. Threshold the blur to get a solid offset shape.
 */
export const generateSilhouetteShape = async (imageSrc: string, settings: CutterSettings): Promise<THREE.Shape | null> => {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  
  const aspect = img.height / img.width;
  canvas.width = PROCESS_RES;
  canvas.height = PROCESS_RES * aspect;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // --- PASS 1: High Contrast Base ---
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let data = imageData.data;
  
  // Make the content solid black
  for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const isContent = avg < 200; 
      const val = isContent ? 0 : 255;
      data[i] = val; 
      data[i+1] = val; 
      data[i+2] = val;
  }
  ctx.putImageData(imageData, 0, 0);

  // --- PASS 2: Dilation (The "Offset") ---
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tCtx = tempCanvas.getContext('2d');
  if(!tCtx) return null;
  
  tCtx.fillStyle = 'white';
  tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  
  // The Shadow Blur acts as a uniform dilation
  // 30px blur @ 1200px is roughly ~2.5mm offset on a 100mm cutter
  const offsetAmount = 30; 
  tCtx.shadowColor = "black";
  tCtx.shadowBlur = offsetAmount;
  
  // Draw multiple times to make the shadow dense enough to threshold clearly
  tCtx.drawImage(canvas, 0, 0);
  tCtx.drawImage(canvas, 0, 0);
  tCtx.drawImage(canvas, 0, 0);

  // --- PASS 3: Cutter Threshold ---
  const bubbleData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const bData = bubbleData.data;
  
  // Cut high into the blur to get a smooth, rounded edge
  const cutThreshold = 240; 
  
  for (let i = 0; i < bData.length; i += 4) {
    const avg = (bData[i] + bData[i+1] + bData[i+2]) / 3;
    const isInsideBubble = avg < cutThreshold;
    const val = isInsideBubble ? 0 : 255;
    bData[i] = val;
    bData[i+1] = val;
    bData[i+2] = val;
    bData[i+3] = 255;
  }

  // --- PASS 4: Vector Trace ---
  // High smoothing settings to simulate "Molded Plastic"
  const svgString = ImageTracer.imagedataToSVG(bubbleData, { 
    ltres: 2, // Linear threshold: Higher = fewer points, smoother straight lines
    qtres: 2, // Quadratic threshold: Higher = smoother curves
    pathomit: 250, // Ignore small noise
    viewbox: true,
    desc: false,
    blurradius: 5, // Blur before trace removes pixel steps
    blurdelta: 10
  });

  const shapes = svgToShapes(svgString);
  if (shapes.length === 0) return null;

  // Return largest shape
  let bestShape = shapes[0];
  let maxArea = 0;
  shapes.forEach(shape => {
    const area = Math.abs(THREE.ShapeUtils.area(shape.getPoints()));
    if (area > maxArea) {
      maxArea = area;
      bestShape = shape;
    }
  });

  return bestShape;
};

export const createBasePlate = (settings: CutterSettings, outlineShape?: THREE.Shape): THREE.BufferGeometry => {
  const thickness = settings.baseThickness;
  
  if (settings.shape === 'outline' && outlineShape) {
    const geometry = new THREE.ExtrudeGeometry(outlineShape, {
      depth: thickness,
      bevelEnabled: false,
      steps: 1
    });
    geometry.translate(0, 0, -thickness);
    return geometry;
  }

  if (settings.shape === 'rectangle') {
    const geometry = new THREE.BoxGeometry(settings.width, settings.height, thickness);
    geometry.translate(0, 0, -thickness / 2);
    return geometry;
  } else {
    const radius = settings.width / 2;
    const geometry = new THREE.CylinderGeometry(radius, radius, thickness, 64);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, -thickness / 2);
    return geometry;
  }
};

export const createCutterFrame = (settings: CutterSettings, outlineShape?: THREE.Shape): THREE.BufferGeometry => {
  const totalHeight = settings.frameHeight + settings.baseThickness;

  if (settings.shape === 'outline' && outlineShape) {
    const points = outlineShape.getPoints();
    if (points.length > 0 && !points[0].equals(points[points.length-1])) {
        points.push(points[0]);
    }
    
    // Dynamic scale factor for wall thickness based on user settings
    // s = 1 - (2 * thickness / width)
    // We clamp it to avoid negative scale if thickness is absurdly high relative to width
    const scale = Math.max(0.5, 1 - (2 * settings.frameThickness / settings.width));
    
    let cx = 0, cy = 0;
    points.forEach(p => { cx += p.x; cy += p.y });
    cx /= points.length;
    cy /= points.length;
    
    const wallShape = new THREE.Shape(points);
    const holePoints = points.map(p => {
        return new THREE.Vector2(
            cx + (p.x - cx) * scale,
            cy + (p.y - cy) * scale
        );
    });
    const holePath = new THREE.Path(holePoints);
    wallShape.holes.push(holePath);
    
    const geometry = new THREE.ExtrudeGeometry(wallShape, {
        depth: totalHeight,
        bevelEnabled: false,
        steps: 1
    });
    geometry.translate(0, 0, -settings.baseThickness);
    return geometry;
  }

  // Box/Circle
  const shape = new THREE.Shape();
  const w = settings.width / 2;
  const h = settings.height / 2;
  const t = settings.frameThickness;

  if (settings.shape === 'rectangle') {
    shape.moveTo(-w - t, -h - t);
    shape.lineTo(w + t, -h - t);
    shape.lineTo(w + t, h + t);
    shape.lineTo(-w - t, h + t);
    shape.lineTo(-w - t, -h - t);
    const hole = new THREE.Path();
    hole.moveTo(-w, -h);
    hole.lineTo(-w, h);
    hole.lineTo(w, h);
    hole.lineTo(w, -h);
    hole.lineTo(-w, -h);
    shape.holes.push(hole);
  } else {
    const r = w;
    shape.absarc(0, 0, r + t, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, r, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: totalHeight, 
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -settings.baseThickness);

  return geometry;
};

export const createStampGeometry = async (imageSrc: string, settings: CutterSettings): Promise<THREE.BufferGeometry> => {
    const img = await loadImage(imageSrc);
    const canvas = document.createElement('canvas');
    
    const aspect = img.height / img.width;
    canvas.width = PROCESS_RES;
    canvas.height = PROCESS_RES * aspect;

    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.BufferGeometry();
      
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Thresholding
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const isDark = avg < settings.threshold;
        const isSolid = settings.invert ? !isDark : isDark;
        const val = isSolid ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 255; 
    }
    ctx.putImageData(imageData, 0, 0);

    // CRITICAL: Trace settings for "Molded Plastic" look.
    // Adjusted to capture smaller details (eyes, pupils) while still smoothing noise.
    const svgString = ImageTracer.imagedataToSVG(imageData, { 
        ltres: 1.0, // Reduced from 2.0 to capture sharper turns (eyes)
        qtres: 1.0, // Reduced from 2.0 to capture tighter curves
        pathomit: 50, // Reduced from 100 to allow smaller details like pupils to exist
        blurradius: 4, // Reduced from 6 to prevent blurring out small negative spaces
        blurdelta: 15,
        viewbox: true,
        desc: false,
    });

    const shapes = svgToShapes(svgString);
    if (shapes.length === 0) return new THREE.BufferGeometry();

    const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: settings.detailHeight,
        bevelEnabled: false, 
        steps: 1
    });

    geometry.scale(1, -1, 1);
    return geometry;
};