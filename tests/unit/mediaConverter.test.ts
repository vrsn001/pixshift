import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversionSettings } from "@/types/converter";

const baseSettings: ConversionSettings = {
  quality: 85,
  width: null,
  height: null,
  maintainAspectRatio: true,
  audioBitrate: "192k",
  stripExif: true,
};

describe("mediaConverter & WebCodecs routing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/converters/webcodecsMedia");
    vi.doUnmock("@ffmpeg/ffmpeg");
    vi.doUnmock("@ffmpeg/util");
  });

  it("test_validateTrimRange_rejects_inverted_range", async () => {
    const { validateTrimRange } = await import("@/lib/converters/mediaConverter");

    expect(() => validateTrimRange(5, 3)).toThrow(/Trim end must be greater than trim start/i);
    expect(() => validateTrimRange(2, 2)).toThrow(/Trim end must be greater than trim start/i);
    expect(() => validateTrimRange(-1, 4)).toThrow(/Trim start must be non-negative/i);
    expect(() => validateTrimRange(null, -2)).toThrow(/Trim end must be non-negative/i);

    expect(validateTrimRange(0, 3.5)).toEqual({ start: 0, end: 3.5 });
    expect(validateTrimRange(1.2, null)).toEqual({ start: 1.2 });
    expect(validateTrimRange(null, null)).toEqual({});
  });

  it("test_buildFfmpegArgs_includes_trim_height_only_scale_and_crf", async () => {
    const { buildFfmpegArgs } = await import("@/lib/converters/mediaConverter");

    const args = buildFfmpegArgs("in.mp4", "out.mp4", "mp4", {
      ...baseSettings,
      quality: 80,
      width: null,
      height: 720,
      maintainAspectRatio: true,
      trimStart: 1.5,
      trimEnd: 4.5,
      videoQualityPreset: "compact",
    });

    expect(args).toEqual(
      expect.arrayContaining(["-ss", "1.5", "-to", "4.5", "-vf", "scale=-2:720", "-crf", "32"])
    );
    expect(args.join(" ")).not.toContain("unpkg.com");
  });

  it("test_transcodeMediaWithInfo_falls_back_to_ffmpeg_when_webcodecs_unavailable", async () => {
    const mockExec = vi.fn().mockResolvedValue(0);
    const mockDelete = vi.fn().mockResolvedValue(true);

    vi.doMock("@/lib/converters/webcodecsMedia", () => ({
      resolveTargetBitrate: vi.fn().mockReturnValue(2_500_000),
      probeWebCodecsSupport: vi.fn().mockResolvedValue(false),
      transcodeWithMediabunny: vi.fn().mockRejectedValue(new Error("Should not call")),
    }));
    vi.doMock("@ffmpeg/ffmpeg", () => ({
      FFmpeg: class {
        on = vi.fn();
        off = vi.fn();
        load = vi.fn().mockResolvedValue(true);
        writeFile = vi.fn().mockResolvedValue(true);
        exec = mockExec;
        readFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
        deleteFile = mockDelete;
      },
    }));
    vi.doMock("@ffmpeg/util", () => ({
      toBlobURL: vi.fn(async (url: string) => url),
      fetchFile: vi.fn().mockResolvedValue(new Uint8Array([9, 8])),
    }));

    const { transcodeMediaWithInfo } = await import("@/lib/converters/mediaConverter");
    const file = new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });

    const res = await transcodeMediaWithInfo(file, "mp4", baseSettings);
    expect(res.engine).toBe("ffmpeg");
    expect(res.blob.size).toBe(4);
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(2);

    // Also verify fallback when WebCodecs throws at runtime AND verify non-zero FFmpeg exit throws
    vi.resetModules();
    vi.doMock("@/lib/converters/webcodecsMedia", () => ({
      resolveTargetBitrate: vi.fn().mockReturnValue(2_500_000),
      probeWebCodecsSupport: vi.fn().mockResolvedValue(true),
      transcodeWithMediabunny: vi.fn().mockRejectedValue(new Error("HW encoder failed")),
    }));
    vi.doMock("@ffmpeg/ffmpeg", () => ({
      FFmpeg: class {
        on = vi.fn();
        off = vi.fn();
        load = vi.fn().mockResolvedValue(true);
        writeFile = vi.fn().mockResolvedValue(true);
        exec = vi.fn().mockResolvedValue(1);
        readFile = vi.fn();
        deleteFile = vi.fn().mockResolvedValue(true);
      },
    }));
    vi.doMock("@ffmpeg/util", () => ({
      toBlobURL: vi.fn(async (url: string) => url),
      fetchFile: vi.fn().mockResolvedValue(new Uint8Array([9, 8])),
    }));

    const mod2 = await import("@/lib/converters/mediaConverter");
    await expect(mod2.transcodeMediaWithInfo(file, "mp4", baseSettings)).rejects.toThrow(
      /exit code 1/i
    );
  });

  it("test_transcodeMediaWithInfo_uses_webcodecs_when_supported", async () => {
    const hwBlob = new Blob([new Uint8Array([0, 0, 0, 24])], { type: "video/mp4" });
    vi.doMock("@/lib/converters/webcodecsMedia", () => ({
      resolveTargetBitrate: vi.fn().mockReturnValue(2_500_000),
      probeWebCodecsSupport: vi.fn().mockResolvedValue(true),
      transcodeWithMediabunny: vi.fn().mockResolvedValue(hwBlob),
    }));

    const { transcodeMediaWithInfo } = await import("@/lib/converters/mediaConverter");
    const file = new File([new Uint8Array([1, 2, 3])], "clip.webm", { type: "video/webm" });

    const res = await transcodeMediaWithInfo(file, "mp4", baseSettings);
    expect(res.engine).toBe("webcodecs");
    expect(res.blob).toBe(hwBlob);
  });

  it("test_buildFfmpegArgs_gif_respects_fps_width_loop_and_reverse", async () => {
    const { buildFfmpegArgs } = await import("@/lib/converters/mediaConverter");

    const args = buildFfmpegArgs("clip.webm", "out.gif", "gif", {
      ...baseSettings,
      fps: 18,
      width: 360,
      gifLoop: 3,
      reverseGif: true,
      trimStart: 0.2,
      trimEnd: 1.4,
    });

    expect(args).toEqual(expect.arrayContaining(["-ss", "0.2", "-to", "1.4", "-loop", "3"]));
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThan(-1);
    const vf = args[vfIdx + 1] ?? "";
    expect(vf).toContain("fps=18");
    expect(vf).toContain("scale=360:-1:flags=lanczos");
    expect(vf).toContain("reverse");
    expect(vf).toContain("palettegen");
    expect(vf).toContain("paletteuse");
  });

  it("test_buildFfmpegArgs_audio_trim_outputs_vn_trim_and_bitrate", async () => {
    const { buildFfmpegArgs } = await import("@/lib/converters/mediaConverter");

    const args = buildFfmpegArgs("tone.wav", "clip.mp3", "mp3", {
      ...baseSettings,
      trimStart: 0.5,
      trimEnd: 1.8,
      audioBitrate: "256k",
    });

    expect(args).toEqual(
      expect.arrayContaining(["-ss", "0.5", "-to", "1.8", "-vn", "-b:a", "256k"])
    );
  });
});
