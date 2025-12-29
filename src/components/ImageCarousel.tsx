import { useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import useEmblaCarousel from "embla-carousel-react";

interface ImageCarouselProps {
  images: Array<{ id: string; image_url: string }>;
  fallbackImage?: string;
  alt: string;
  className?: string;
}

export const ImageCarousel = ({ images, fallbackImage, alt, className }: ImageCarouselProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const allImages = images.length > 0 
    ? images.map(img => img.image_url)
    : fallbackImage 
    ? [fallbackImage]
    : [];

  const hasMultipleImages = allImages.length > 1;

  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: true,
    dragFree: false,
    containScroll: "trimSnaps",
  });

  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback((index: number) => {
    emblaApi?.scrollTo(index);
  }, [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (allImages.length === 0) {
    return (
      <div className={cn("aspect-square bg-muted rounded-lg flex items-center justify-center", className)}>
        <Package className="h-24 w-24 text-muted-foreground/30" />
      </div>
    );
  }

  // Single image - no carousel needed
  if (!hasMultipleImages) {
    return (
      <div className={cn("relative aspect-square bg-muted rounded-lg overflow-hidden", className)}>
        <img 
          src={allImages[0]} 
          alt={alt} 
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className={cn("relative aspect-square bg-muted rounded-lg overflow-hidden", className)}>
      {/* Embla Carousel Container */}
      <div className="overflow-hidden h-full" ref={emblaRef}>
        <div className="flex h-full touch-pan-y">
          {allImages.map((src, index) => (
            <div 
              key={index} 
              className="flex-[0_0_100%] min-w-0 h-full"
            >
              <img 
                src={src} 
                alt={`${alt} ${index + 1}`} 
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>
      
      {/* Navigation Arrows */}
      <Button
        variant="secondary"
        size="icon"
        className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 min-h-[44px] min-w-[44px] rounded-full bg-background/80 hover:bg-background touch-manipulation"
        onClick={(e) => {
          e.stopPropagation();
          scrollPrev();
        }}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 min-h-[44px] min-w-[44px] rounded-full bg-background/80 hover:bg-background touch-manipulation"
        onClick={(e) => {
          e.stopPropagation();
          scrollNext();
        }}
      >
        <ChevronRight className="h-5 w-5" />
      </Button>

      {/* Dots Indicator */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
        {allImages.map((_, index) => (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              scrollTo(index);
            }}
            className={cn(
              "h-2.5 rounded-full transition-all touch-manipulation",
              index === selectedIndex 
                ? "bg-primary w-6" 
                : "bg-background/60 hover:bg-background/80 w-2.5"
            )}
            aria-label={`Go to image ${index + 1}`}
          />
        ))}
      </div>

      {/* Image Counter */}
      <div className="absolute top-2 right-2 bg-background/80 text-foreground px-2 py-1 rounded text-xs font-medium">
        {selectedIndex + 1} / {allImages.length}
      </div>
    </div>
  );
};
