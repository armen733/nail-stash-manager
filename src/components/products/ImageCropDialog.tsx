import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

export function ImageCropDialog({ open, file, onCancel, onConfirm }: ImageCropDialogProps) {
  const [imgSrc, setImgSrc] = useState<string>("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(1);
  const imgRef = useRef<HTMLImageElement>(null);

  // Load file
  useState(() => {
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImgSrc(reader.result as string);
      reader.readAsDataURL(file);
    }
  });

  // Reset when file changes
  useState(() => {
    setImgSrc("");
    setCrop(undefined);
    setCompletedCrop(undefined);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImgSrc(reader.result as string);
      reader.readAsDataURL(file);
    }
  });

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (aspect) setCrop(centerAspectCrop(width, height, aspect));
  }, [aspect]);

  const handleAspectChange = (val: string) => {
    const opt = ASPECT_OPTIONS.find(o => o.value === val);
    setAspect(opt?.ratio);
    if (imgRef.current && opt?.ratio) {
      const { width, height } = imgRef.current;
      setCrop(centerAspectCrop(width, height, opt.ratio));
    } else {
      setCrop(undefined);
    }
  };

  const handleConfirm = async () => {
    if (!imgRef.current || !file) return;
    const image = imgRef.current;

    // If no crop made, just pass original
    if (!completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      onConfirm(file);
      return;
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(completedCrop.width * scaleX);
    canvas.height = Math.floor(completedCrop.height * scaleY);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
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
          <DialogTitle>Crop Photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Aspect:</Label>
            <Select
              value={aspect ? ASPECT_OPTIONS.find(o => o.ratio === aspect)?.value || "1" : "free"}
              onValueChange={handleAspectChange}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-center bg-muted/30 p-2 rounded">
            {imgSrc && (
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspect}
                className="max-h-[60vh]"
              >
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="Crop preview"
                  onLoad={onImageLoad}
                  className="max-h-[60vh] object-contain"
                />
              </ReactCrop>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Drag corners to adjust crop area. Choose aspect ratio above or use "Free" to crop freely.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm}>Apply Crop</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
