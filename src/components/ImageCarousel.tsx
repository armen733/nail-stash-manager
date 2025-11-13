import { useState } from "react";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageCarouselProps {
  images: Array<{ id: string; image_url: string }>;
  fallbackImage?: string;
  alt: string;
  className?: string;
}

export const ImageCarousel = ({ images, fallbackImage, alt, className }: ImageCarouselProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const allImages = images.length > 0 
    ? images.map(img => img.image_url)
    : fallbackImage 
    ? [fallbackImage]
    : [];

  const hasMultipleImages = allImages.length > 1;

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % allImages.length);
  };

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  };

  if (allImages.length === 0) {
    return (
      <div className={cn("aspect-square bg-muted rounded-lg flex items-center justify-center", className)}>
        <Package className="h-24 w-24 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className={cn("relative aspect-square bg-muted rounded-lg overflow-hidden", className)}>
      <img 
        src={allImages[currentIndex]} 
        alt={alt} 
        className="w-full h-full object-cover"
      />
      
      {hasMultipleImages && (
        <>
          {/* Navigation Arrows */}
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 hover:bg-background"
            onClick={prevImage}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 hover:bg-background"
            onClick={nextImage}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Dots Indicator */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {allImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  index === currentIndex 
                    ? "bg-primary w-6" 
                    : "bg-background/60 hover:bg-background/80"
                )}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>

          {/* Image Counter */}
          <div className="absolute top-2 right-2 bg-background/80 text-foreground px-2 py-1 rounded text-xs font-medium">
            {currentIndex + 1} / {allImages.length}
          </div>
        </>
      )}
    </div>
  );
};
