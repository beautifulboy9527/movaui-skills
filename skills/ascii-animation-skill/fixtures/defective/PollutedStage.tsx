export function PollutedStage() {
  return (
    <div className="relative h-screen w-full bg-black">
      <div className="mt-8 border-t border-[#16282a] pt-4 text-xs text-slate-400">
        <div>Video Clip: Cosmic Structure | Cyber Portrait</div>
        <label>
          Particle Size: 8.5px
          <input type="range" min={3.5} max={15} step={0.5} defaultValue={8.5} />
        </label>
        <div>Presets: Fine (5px) | Bold (8.5px) | Chunky (12px)</div>
        <div>Particle Form: Glowing Dots | Diamonds | Voxels</div>
        <div>Shortcuts: [1/2] Switch Video · [+/-] Adjust Particle Size</div>
      </div>
    </div>
  );
}
