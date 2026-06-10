import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, RotateCw, Maximize2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ImageCropDialogProps {
  open: boolean;
  file: File | null;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}

const ASPECT_OPTIONS: { label: string; value: string; ratio: number | undefined }[] = [
  { label: "Square 1:1", value: "1", ratio: 1 },
  { label: "4:3", value: "1.333", ratio: 4 / 3 },
  { label: "3:4", value: "0.75", ratio: 3 / 4 },
  { label: "16:9", value: "1.777", ratio: 16 / 9 },
  { label: "Free", value: "free", ratio: undefined },
];

function centerAspectCrop(width: number, height: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height),
    width,
    height
  );
}

function centerFreeCrop(): Crop {
  return { unit: "%", x: 5, y: 5, width: 90, height: 90 };
}

export function ImageCropDialog({ open, file, onCancel, onConfirm }: ImageCropDialogProps) {
  const [imgSrc, setImgSrc] = useState<string>("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setImgSrc("");
    setCrop(undefined);
    setCompletedCrop(undefined);
    setZoom(1);
    setRotation(0);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImgSrc(reader.result as string);
      reader.readAsDataURL(file);
    }
  }, [file]);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (aspect) setCrop(centerAspectCrop(width, height, aspect));
    else setCrop(centerFreeCrop());
  }, [aspect]);

  const recenterCrop = () => {
    if (!imgRef.current) return;
    const { width, height } = imgRef.current;
    if (aspect) setCrop(centerAspectCrop(width, height, aspect));
    else setCrop(centerFreeCrop());
  };

  const handleAspectChange = (val: string) => {
    const opt = ASPECT_OPTIONS.find(o => o.value === val);
    setAspect(opt?.ratio);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      if (opt?.ratio) setCrop(centerAspectCrop(width, height, opt.ratio));
      else setCrop(centerFreeCrop());
    }
  };

  const handleConfirm = async () => {
    if (!imgRef.current || !file) return;
    const image = imgRef.current;

    if (!completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      onConfirm(file);
      return;
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const cropW = Math.floor(completedCrop.width * scaleX);
    const cropH = Math.floor(completedCrop.height * scaleY);
    const canvas = document.createElement("canvas");

    const rad = (rotation * Math.PI) / 180;
    const rotated = rotation % 180 !== 0;
    canvas.width = rotated ? cropH : cropW;
    canvas.height = rotated ? cropW : cropH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      cropW,
      cropH,
      -cropW / 2,
      -cropH / 2,
      cropW,
      cropH
    );

    const mime = file.type || "image/jpeg";
    canvas.toBlob((blob) => {
      if (!blob) return;
      const ext = mime.split("/")[1] || "jpg";
      const nameBase = file.name.replace(/\.[^.]+$/, "");
      const cropped = new File([blob], `${nameBase}-cropped.${ext}`, { type: mime });
      onConfirm(cropped);
    }, mime, 0.92);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crop & Adjust Photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-sm">Aspect:</Label>
            <Select
              value={aspect ? ASPECT_OPTIONS.find(o => o.ratio === aspect)?.value || "1" : "free"}
              onValueChange={handleAspectChange}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={recenterCrop}>
              <Maximize2 className="h-4 w-4 mr-1" /> Center
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)}>
              <RotateCw className="h-4 w-4 mr-1" /> Rotate
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 text-muted-foreground" />
            <Slider
              value={[zoom * 100]}
              min={50}
              max={300}
              step={5}
              onValueChange={(v) => setZoom(v[0] / 100)}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground w-12 text-right">{Math.round(zoom * 100)}%</span>
          </div>

          <div className="flex justify-center bg-muted/30 p-2 rounded overflow-auto" style={{ maxHeight: "60vh" }}>
            {imgSrc && (
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspect}
              >
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="Crop preview"
                  onLoad={onImageLoad}
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: "center",
                    maxHeight: "55vh",
                    transition: "transform 0.15s ease",
                  }}
                  className="object-contain"
                />
              </ReactCrop>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Drag the corners to resize, drag inside the box to reposition. Use the slider to zoom in and the Center button to recenter.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
