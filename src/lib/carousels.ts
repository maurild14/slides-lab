import { readDataSafe, mutateData, ABORT_WRITE } from "./data";
import { generateId, now } from "./utils";
import type { Carousel, CarouselsData, Slide, AspectRatio, ReferenceImage } from "@/types/carousel";
import { MAX_SLIDES, MAX_VERSIONS } from "@/types/carousel";

const FILE = "carousels.json";
const EMPTY: CarouselsData = { carousels: [] };

async function load(): Promise<CarouselsData> {
  return readDataSafe<CarouselsData>(FILE, EMPTY);
}

/**
 * Every mutation below runs inside `mutateData`, which holds the file lock
 * across the whole read-modify-write cycle. Reading outside the lock and
 * writing inside it loses concurrent updates — see the note in data.ts.
 */
function mutate<R>(
  fn: (data: CarouselsData) => R | typeof ABORT_WRITE
): Promise<R | null> {
  return mutateData<CarouselsData, R>(FILE, { carousels: [] }, fn);
}

export async function listCarousels(): Promise<Carousel[]> {
  const data = await load();
  return data.carousels.filter((c) => !c.isTemplate);
}

export async function getCarousel(id: string): Promise<Carousel | null> {
  const data = await load();
  return data.carousels.find((c) => c.id === id) ?? null;
}

export async function createCarousel(
  name: string,
  aspectRatio: AspectRatio
): Promise<Carousel> {
  const carousel: Carousel = {
    id: generateId(),
    name,
    aspectRatio,
    slides: [],
    referenceImages: [],
    chatSessionId: null,
    isTemplate: false,
    tags: [],
    createdAt: now(),
    updatedAt: now(),
  };
  await mutate((data) => {
    data.carousels.push(carousel);
    return carousel;
  });
  return carousel;
}

export async function updateCarousel(
  id: string,
  updates: Partial<Pick<Carousel, "name" | "aspectRatio" | "tags" | "chatSessionId" | "caption" | "hashtags">>
): Promise<Carousel | null> {
  return mutate((data) => {
    const carousel = data.carousels.find((c) => c.id === id);
    if (!carousel) return ABORT_WRITE;
    Object.assign(carousel, updates, { updatedAt: now() });
    return carousel;
  });
}

export async function duplicateCarousel(id: string): Promise<Carousel | null> {
  return mutate((data) => {
    const source = data.carousels.find((c) => c.id === id);
    if (!source) return ABORT_WRITE;

    const duplicate: Carousel = {
      ...source,
      id: generateId(),
      name: `${source.name} (copy)`,
      slides: source.slides.map((s) => ({
        ...s,
        id: generateId(),
        previousVersions: [],
      })),
      referenceImages: [...(source.referenceImages || [])],
      chatSessionId: null,
      isTemplate: false,
      createdAt: now(),
      updatedAt: now(),
    };

    data.carousels.push(duplicate);
    return duplicate;
  });
}

export async function deleteCarousel(id: string): Promise<boolean> {
  const result = await mutate((data) => {
    const idx = data.carousels.findIndex((c) => c.id === id);
    if (idx === -1) return ABORT_WRITE;
    data.carousels.splice(idx, 1);
    return true;
  });
  return result === true;
}

// --- Slide operations ---

export async function addSlide(
  carouselId: string,
  html: string,
  notes = ""
): Promise<Slide | null> {
  return mutate((data) => {
    const carousel = data.carousels.find((c) => c.id === carouselId);
    if (!carousel) return ABORT_WRITE;
    if (carousel.slides.length >= MAX_SLIDES) return ABORT_WRITE;

    const slide: Slide = {
      id: generateId(),
      html,
      previousVersions: [],
      order: carousel.slides.length,
      notes,
    };
    carousel.slides.push(slide);
    carousel.updatedAt = now();
    return slide;
  });
}

export async function updateSlide(
  carouselId: string,
  slideId: string,
  updates: Partial<Pick<Slide, "html" | "notes">>
): Promise<Slide | null> {
  return mutate((data) => {
    const carousel = data.carousels.find((c) => c.id === carouselId);
    if (!carousel) return ABORT_WRITE;
    const slide = carousel.slides.find((s) => s.id === slideId);
    if (!slide) return ABORT_WRITE;

    // Save current HTML to version history before overwriting
    if (updates.html && updates.html !== slide.html) {
      slide.previousVersions.push(slide.html);
      if (slide.previousVersions.length > MAX_VERSIONS) {
        slide.previousVersions.shift();
      }
    }

    Object.assign(slide, updates);
    carousel.updatedAt = now();
    return slide;
  });
}

export async function duplicateSlide(
  carouselId: string,
  slideId: string
): Promise<Slide | null> {
  return mutate((data) => {
    const carousel = data.carousels.find((c) => c.id === carouselId);
    if (!carousel) return ABORT_WRITE;
    if (carousel.slides.length >= MAX_SLIDES) return ABORT_WRITE;
    const idx = carousel.slides.findIndex((s) => s.id === slideId);
    if (idx === -1) return ABORT_WRITE;

    const copy: Slide = {
      ...carousel.slides[idx],
      id: generateId(),
      previousVersions: [],
    };
    carousel.slides.splice(idx + 1, 0, copy);
    carousel.slides.forEach((s, i) => {
      s.order = i;
    });
    carousel.updatedAt = now();
    return copy;
  });
}

export async function deleteSlide(
  carouselId: string,
  slideId: string
): Promise<boolean> {
  const result = await mutate((data) => {
    const carousel = data.carousels.find((c) => c.id === carouselId);
    if (!carousel) return ABORT_WRITE;
    const idx = carousel.slides.findIndex((s) => s.id === slideId);
    if (idx === -1) return ABORT_WRITE;

    carousel.slides.splice(idx, 1);
    // Re-order remaining slides
    carousel.slides.forEach((s, i) => {
      s.order = i;
    });
    carousel.updatedAt = now();
    return true;
  });
  return result === true;
}

export async function reorderSlides(
  carouselId: string,
  slideIds: string[]
): Promise<boolean> {
  const result = await mutate((data) => {
    const carousel = data.carousels.find((c) => c.id === carouselId);
    if (!carousel) return ABORT_WRITE;

    const slideMap = new Map(carousel.slides.map((s) => [s.id, s]));
    const reordered: Slide[] = [];
    for (const id of slideIds) {
      const slide = slideMap.get(id);
      if (!slide) return ABORT_WRITE;
      slide.order = reordered.length;
      reordered.push(slide);
    }
    carousel.slides = reordered;
    carousel.updatedAt = now();
    return true;
  });
  return result === true;
}

export async function undoSlide(
  carouselId: string,
  slideId: string
): Promise<Slide | null> {
  return mutate((data) => {
    const carousel = data.carousels.find((c) => c.id === carouselId);
    if (!carousel) return ABORT_WRITE;
    const slide = carousel.slides.find((s) => s.id === slideId);
    if (!slide || slide.previousVersions.length === 0) return ABORT_WRITE;

    slide.html = slide.previousVersions.pop()!;
    carousel.updatedAt = now();
    return slide;
  });
}

// --- Reference images ---

export async function addReferenceImage(
  carouselId: string,
  image: ReferenceImage
): Promise<ReferenceImage | null> {
  return mutate((data) => {
    const carousel = data.carousels.find((c) => c.id === carouselId);
    if (!carousel) return ABORT_WRITE;

    if (!carousel.referenceImages) carousel.referenceImages = [];
    carousel.referenceImages.push(image);
    carousel.updatedAt = now();
    return image;
  });
}

export async function removeReferenceImage(
  carouselId: string,
  imageId: string
): Promise<boolean> {
  const result = await mutate((data) => {
    const carousel = data.carousels.find((c) => c.id === carouselId);
    if (!carousel || !carousel.referenceImages) return ABORT_WRITE;

    const idx = carousel.referenceImages.findIndex((img) => img.id === imageId);
    if (idx === -1) return ABORT_WRITE;

    carousel.referenceImages.splice(idx, 1);
    carousel.updatedAt = now();
    return true;
  });
  return result === true;
}
