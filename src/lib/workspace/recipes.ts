import {
  applyBulkSettings,
  applyBulkTargetFormat,
  type BulkApplyOptions,
  type BulkUpdateResult,
} from "@/lib/converters/workspaceHelpers";
import type {
  ConversionJob,
  ConversionSettings,
  FileCategory,
  SupportedFormat,
} from "@/types/converter";

export interface ConversionRecipe {
  id: string;
  name: string;
  description: string;
  category: FileCategory;
  targetFormat: SupportedFormat;
  patch: Partial<ConversionSettings>;
  isBuiltIn?: boolean;
}

export const BUILT_IN_RECIPES: readonly ConversionRecipe[] = [
  {
    id: "web-webp",
    name: "Web Asset Pack",
    description: "WebP 82% · Max 1920px · Strip EXIF",
    category: "image",
    targetFormat: "webp",
    patch: {
      quality: 82,
      width: 1920,
      height: null,
      maintainAspectRatio: true,
      stripExif: true,
      targetSizeKb: null,
    },
    isBuiltIn: true,
  },
  {
    id: "under-200kb",
    name: "Under 200 KB",
    description: "Auto target-size <= 200 KB JPEG · Strip EXIF",
    category: "image",
    targetFormat: "jpeg",
    patch: {
      quality: 85,
      targetSizeKb: 200,
      stripExif: true,
    },
    isBuiltIn: true,
  },
  {
    id: "privacy-clean",
    name: "Strip EXIF & Shrink",
    description: "WebP 88% · Strip GPS & Camera EXIF",
    category: "image",
    targetFormat: "webp",
    patch: {
      quality: 88,
      stripExif: true,
      targetSizeKb: null,
    },
    isBuiltIn: true,
  },
  {
    id: "discord-gif",
    name: "Looping Sticker GIF",
    description: "480px wide · 12 FPS · Infinite loop",
    category: "video",
    targetFormat: "gif",
    patch: {
      width: 480,
      height: null,
      fps: 12,
      gifLoop: 0,
    },
    isBuiltIn: true,
  },
  {
    id: "compact-1080p",
    name: "Compact 1080p MP4",
    description: "Balanced H.264 · Max 1920x1080",
    category: "video",
    targetFormat: "mp4",
    patch: {
      width: 1920,
      height: 1080,
      maintainAspectRatio: true,
      videoQualityPreset: "balanced",
    },
    isBuiltIn: true,
  },
];

const CUSTOM_RECIPES_STORAGE_KEY = "pixshift.customRecipes.v1";

/**
 * Applies a recipe's target format and settings patch to queued jobs matching
 * `recipe.category` (and optional folder filter).
 */
export function applyRecipeToJobs(
  jobs: readonly ConversionJob[],
  recipe: ConversionRecipe,
  options?: Pick<BulkApplyOptions, "folderFilter">
): BulkUpdateResult {
  const scope: BulkApplyOptions = {
    folderFilter: options?.folderFilter,
    categoryFilter: recipe.category,
  };
  const formatted = applyBulkTargetFormat(jobs, recipe.targetFormat, scope);
  const patched = applyBulkSettings(formatted.jobs, recipe.patch, scope);
  return {
    jobs: patched.jobs,
    updatedCount: Math.min(formatted.updatedCount, patched.updatedCount),
    skippedCount: Math.max(formatted.skippedCount, patched.skippedCount),
  };
}

export function loadCustomRecipes(): ConversionRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_RECIPES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ConversionRecipe =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ConversionRecipe).id === "string" &&
        typeof (item as ConversionRecipe).name === "string" &&
        typeof (item as ConversionRecipe).category === "string" &&
        typeof (item as ConversionRecipe).targetFormat === "string"
    );
  } catch {
    return [];
  }
}

export function saveCustomRecipe(recipe: Omit<ConversionRecipe, "id" | "isBuiltIn">): ConversionRecipe[] {
  const existing = loadCustomRecipes();
  const next: ConversionRecipe[] = [
    ...existing,
    {
      ...recipe,
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      isBuiltIn: false,
    },
  ];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CUSTOM_RECIPES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }
  return next;
}

export function deleteCustomRecipe(id: string): ConversionRecipe[] {
  const next = loadCustomRecipes().filter((r) => r.id !== id);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CUSTOM_RECIPES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }
  return next;
}
